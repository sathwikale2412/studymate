"""StudyMate helper service.

Three things the browser cannot do on its own: talk to a language model, reach a
translation endpoint, and turn Python into a flowchart. Everything else — PDF parsing and
retrieval — stays in the browser, so a 20 MB lecture scan never hits the 4.5 MB serverless
request-body cap.

If LLM_API_BASE / LLM_API_KEY / LLM_MODEL are unset the /answer endpoint returns the
retrieved passages instead of invented prose, and says so in `mode`.
"""

import os

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get'
# MyMemory rejects anything longer than about this in one request.
MYMEMORY_CHUNK = 480

LLM_API_BASE = os.environ.get('LLM_API_BASE', '').rstrip('/')
LLM_API_KEY = os.environ.get('LLM_API_KEY', '')
LLM_MODEL = os.environ.get('LLM_MODEL', '')

MAX_PASSAGES = 6
MAX_PASSAGE_CHARS = 1200


def _body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def llm_ready():
    return bool(LLM_API_BASE and LLM_API_KEY and LLM_MODEL)


def _clean_passages(raw_passages):
    passages = []
    for entry in raw_passages or []:
        if isinstance(entry, dict):
            text = str(entry.get('text', '')).strip()
            if text:
                passages.append({
                    'text': text[:MAX_PASSAGE_CHARS],
                    'page': entry.get('page'),
                    'file': entry.get('file'),
                })
        elif isinstance(entry, str) and entry.strip():
            passages.append({'text': entry.strip()[:MAX_PASSAGE_CHARS]})
    return passages[:MAX_PASSAGES]


def _extractive_answer(question, passages):
    """No model, no invented sentences: hand back the strongest matching passages."""
    if not passages:
        return 'Nothing in these PDFs matches the words in your question.', []
    lead = passages[0]
    citation = f" (page {lead['page']} of {lead['file']})" if lead.get('page') and lead.get('file') else ''
    answer = f"The closest passage{citation}: {lead['text']}"
    return answer, passages


def _model_answer(question, passages):

    context = '\n\n'.join(
        f"[{index + 1}] {entry['text']}" for index, entry in enumerate(passages)
    )
    payload = {
        'model': LLM_MODEL,
        'messages': [
            {
                'role': 'system',
                'content': (
                    'Answer only from the numbered passages. Quote the passage numbers you '
                    'used. If the passages do not contain the answer, say exactly that.'
                ),
            },
            {'role': 'user', 'content': f'Passages:\n{context}\n\nQuestion: {question}'},
        ],
        'temperature': 0.2,
        'max_tokens': 500,
    }
    response = requests.post(
        f'{LLM_API_BASE}/chat/completions',
        headers={'Authorization': f'Bearer {LLM_API_KEY}', 'Content-Type': 'application/json'},
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    text = data['choices'][0]['message']['content'].strip()
    return text, passages


def translate(text, source, target):
    """MyMemory, a public JSON endpoint.

    The Streamlit version used deep_translator, which scrapes Google's web translator and
    answers 429 from datacentre addresses — which is what every Vercel function sends from.
    Anonymous MyMemory use is capped at roughly 5000 words a day per IP, shared by everyone
    on the same deployment.
    """
    pieces = []
    remaining = text
    while remaining:
        if len(remaining) <= MYMEMORY_CHUNK:
            pieces.append(remaining)
            break
        cut = remaining.rfind(' ', 0, MYMEMORY_CHUNK)
        cut = cut if cut > 0 else MYMEMORY_CHUNK
        pieces.append(remaining[:cut])
        remaining = remaining[cut:].lstrip()

    translated = []
    for piece in pieces:
        response = requests.get(
            MYMEMORY_ENDPOINT,
            params={'q': piece, 'langpair': f'{source}|{target}'},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get('responseStatus') != 200:
            raise RuntimeError(str(payload.get('responseDetails', 'the translation service refused')))
        translated.append(payload['responseData']['translatedText'])
    return ' '.join(translated)


@app.route('/', defaults={'path': ''}, methods=['GET', 'POST'])
@app.route('/<path:path>', methods=['GET', 'POST'])
def gateway(path):
    action = path.rstrip('/').split('/')[-1]

    if action in ('', 'health'):
        return jsonify({
            'status': 'ok',
            'service': 'studymate-helpers',
            'answer': 'model' if llm_ready() else 'extractive',
            'translation': 'ready',
            'flowchart': 'ready',
        })

    if action == 'answer':
        data = _body()
        question = str(data.get('question', '')).strip()
        if not question:
            return jsonify({'status': 'error', 'message': 'Ask a question first.'}), 400
        passages = _clean_passages(data.get('passages'))
        if not passages:
            return jsonify({
                'status': 'ok',
                'mode': 'none',
                'answer': 'No passage was sent with the question, so there is nothing to answer from.',
                'passages': [],
            })
        try:
            if llm_ready():
                answer, used = _model_answer(question, passages)
                mode = 'model'
            else:
                answer, used = _extractive_answer(question, passages)
                mode = 'extractive'
            return jsonify({'status': 'ok', 'mode': mode, 'answer': answer, 'passages': used})
        except Exception as err:  # noqa: BLE001 - the browser must get a reason, not a stack
            answer, used = _extractive_answer(question, passages)
            return jsonify({
                'status': 'ok',
                'mode': 'extractive',
                'answer': answer,
                'passages': used,
                'warning': f'The language model call failed ({type(err).__name__}); showing the source passages instead.',
            })

    if action == 'translate':
        data = _body()
        text = str(data.get('text', '')).strip()
        target = (str(data.get('target', 'en')).strip().lower() or 'en')
        source = (str(data.get('source', 'en')).strip().lower() or 'en')
        if not text:
            return jsonify({'status': 'error', 'message': 'Nothing to translate.'}), 400
        if len(text) > 5000:
            return jsonify({'status': 'error', 'message': 'Keep each translation under 5000 characters.'}), 413
        try:
            translated = translate(text, source, target)
            return jsonify({'status': 'ok', 'translated': translated, 'target': target})
        except Exception as err:  # noqa: BLE001
            return jsonify({
                'status': 'error',
                'message': f'Translation failed: {type(err).__name__}: {err}',
            }), 502

    if action == 'flowchart':
        code = str(_body().get('code', ''))
        if not code.strip():
            return jsonify({'status': 'error', 'message': 'Paste some Python code first.'}), 400
        try:
            import pyflowchart

            flowchart = pyflowchart.Flowchart.from_code(code).flowchart()
            return jsonify({'status': 'ok', 'mermaid': flowchart})
        except SyntaxError as err:
            return jsonify({'status': 'error', 'message': f'Not valid Python: {err}'}), 400
        except Exception as err:  # noqa: BLE001
            return jsonify({'status': 'error', 'message': f'Could not build a flowchart: {type(err).__name__}: {err}'}), 422

    return jsonify({'status': 'error', 'message': f'Unknown endpoint: /{action}'}), 404
