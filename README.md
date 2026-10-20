# StudyMate

Ask questions about your own PDFs, translate between Indian languages, turn Python into a
flowchart, plot a quick graph and generate cloze quizzes.

Live: https://studymate-five-eta.vercel.app

## What changed from the original

The original was a Streamlit app that ran entirely on your laptop. It could not be hosted on
Vercel or Netlify, because its answer pipeline loads a ~2 GB sentence-transformer model into the
process at import time, and serverless functions get a few hundred MB and a 10-second budget. So
the app was rebuilt as a React/Vite site with three small serverless helpers.

| Piece | Original | Now |
| --- | --- | --- |
| UI | Streamlit (`streamlit_app/app.py`) | React + Vite |
| PDF text | `pdf_processor.py` on the laptop | pdf.js in the browser |
| Retrieval | sentence-transformers + FAISS, semantic | BM25 in the browser, **keyword only** |
| Answer | local `granite` model via Ollama | an OpenAI-compatible API if you set a key, otherwise a quoted passage |
| Translation | `deep_translator` (scrapes Google) | MyMemory JSON API |
| Flowchart | `pyflowchart` | `pyflowchart`, unchanged |
| Plot | matplotlib | inline SVG |
| Quiz | longest-word cloze | longest-word cloze, unchanged |

`streamlit_app/` is kept for reference only. Nothing in the deployed site imports it, and
`answer_generator.py` / `semantic_search.py` download multi-GB models the moment they are
imported — do not run them expecting a quick answer.

## What is real and what is a compromise

| Claim | Reality |
| --- | --- |
| "Semantic search" | **No.** Ranking is BM25 over exact words. "How fast does the object move" will not find a page that says "velocity", because no word matches. |
| PDFs stay private | **Yes.** Files are read with a `FileReader`, parsed in a worker thread and never leave the browser. The server only ever receives the handful of text passages the browser selected. |
| Answers are grounded | **Yes, with a caveat.** With no API key the answer is literally the closest passage quoted back, labelled `quoted from your pages`. With a key it is a model answer constrained to those passages, labelled `language model`. Either way the source page numbers are shown. |
| Translation is unlimited | **No.** MyMemory allows roughly 5000 anonymous words a day per IP, and Vercel shares egress IPs. Expect a quota error on a busy day. |
| Works offline | **No.** There is no service worker. The page needs a connection; only the PDF parsing itself is local. |
| Sign-in is required | **No.** Without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the app skips the auth gate entirely and behaves like the plain static tool — nothing is saved. |

## Architecture

```
browser (React)                         Vercel serverless (Flask)
  pdf.js  ->  pages[]                     /api/answer     -> OpenAI-compatible API
  BM25    ->  top 5 passages   POST --->  /api/translate  -> MyMemory
  SVG     ->  plot                        /api/flowchart  -> pyflowchart
  |                                        /api/health
  +-- Supabase JS ---> auth + Postgres (logins, saved questions)
```

The browser talks to `/api/*` on the same origin, so there is no CORS setup and no separate
backend URL to configure.

## Endpoints

| Route | Method | Body | Returns |
| --- | --- | --- | --- |
| `/api/health` | GET/POST | — | `{status, service, answer: "model"\|"extractive", translation, flowchart}` |
| `/api/answer` | POST | `{question, passages: [{page, file, text}]}` | `{status, mode: "model"\|"extractive"\|"none", answer, passages, warning?}` |
| `/api/translate` | POST | `{text, target, source?}` | `{status, translated, target}` |
| `/api/flowchart` | POST | `{code}` | `{status, mermaid}` |

Anything else is a `404` with a message. An empty question is `400`, a question over 4000
characters or text over 5000 characters is `413`, invalid Python is `400`, and a translator
failure is `502`.

Every failure — including a model call that dies mid-request — answers with one sentence and
a `ref` such as `"ref": "4c9a1f02"`. The exception never reaches the browser: a `requests`
error repeats the URL it aimed at, and both the translation and model URLs carry a key in
the query string. The detail goes to the Vercel function log; quote the `ref` when reporting
it. If the model call fails, `/api/answer` still returns the closest passage and says so in
`mode: "extractive"` rather than failing.

Helper calls are limited to **30 per minute per address**, because `/api/answer` spends a real
model call and the site lets anyone post to it. The counter lives in one warm instance, so it
slows a scripted visitor rather than guaranteeing a ceiling.

```bash
python api/test_gateway.py   # 18 checks — limits, fallbacks, generic errors; no keys needed
```

## Setup

```bash
npm install
cp .env.example .env      # fill in what you have; everything is optional
npm run dev               # http://localhost:5173, /api proxied to :5001
```

In a second terminal, for the helpers:

```bash
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r api/requirements.txt
flask --app api/index.py run --port 5001
```

Without the Flask process running, the PDF question and quiz tabs still work — only translate,
flowchart and model-written answers fail.

## Deploy

```bash
vercel link
vercel env add VITE_SUPABASE_URL       # type: Config
vercel env add VITE_SUPABASE_ANON_KEY  # type: Config
vercel env add LLM_API_BASE            # type: Secret, optional
vercel env add LLM_API_KEY             # type: Secret, optional
vercel env add LLM_MODEL               # type: Secret, optional
vercel deploy --prod
```

`VITE_*` values are inlined at build time, so they must be **Config** rather than Secret and the
site must be redeployed after you add them. `vercel.json` declares two services (Vite frontend,
Flask backend in `api/`) and routes `/api/*` to the backend; with `services` present, all
build settings live inside each service object rather than at the top level.

## Accounts, the login log and row-level security

`supabase/schema.sql` creates:

- `studymate_logins` — one row per sign-in, with the email and timestamp. This is the "who used
  the app and when" record.
- `studymate_questions` — the question, the answer, whether it came from a model or was quoted,
  and the page numbers it was based on.

Both are `RLS`-enabled and every policy compares `auth.uid()` to `user_id`, so a signed-in user
can only ever read their own rows.

Writes go **from the browser with the user's JWT**, never from the serverless function. The
function only holds the public anon key, which carries no identity, so `auth.uid()` is `null`
there and an insert would be rejected by the `with check` clause. That is why `/api/answer`
returns text and leaves persistence to the client. The anon key is safe to ship in the bundle for
exactly this reason: outside a signed-in session it can read and write nothing.

Sign-ups send a confirmation email, so a new account cannot sign in until it is clicked — unless
`mailer_autoconfirm` is on in the Supabase dashboard.

## Data flow of one question

1. `src/utils/pdfText.js` parses each file page by page in a worker.
2. `src/utils/retrieval.js` groups pages into ~160-word chunks and scores them against the
   question with BM25.
3. The top five chunks are POSTed to `/api/answer`; the server trims them to 1200 characters
   each before the model sees them.
4. The answer, its mode and its page numbers render in the panel and, if you are signed in, are
   stored in `studymate_questions`.

## Authorship

The original Streamlit commits are `azmeeratharun`'s. The React app, the Flask helper service,
the Supabase schema and this README were added on top; the eligibility logic, the quiz generator
and the flowchart feature keep the behaviour of the original.
