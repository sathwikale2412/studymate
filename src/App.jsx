import { useEffect, useMemo, useState } from 'react';
import AuthScreen from './components/AuthScreen.jsx';
import { useAuth } from './context/AuthContext.jsx';
import {
  askAboutPdf,
  buildFlowchart,
  fetchLoginHistory,
  fetchQuestions,
  saveQuestion,
  translateText
} from './lib/cloud.js';
import { buildChunks, rankChunks, tokenize } from './utils/retrieval.js';
import { extractPages } from './utils/pdfText.js';

const TABS = [
  { id: 'pdf', label: 'PDF questions' },
  { id: 'translate', label: 'Translate' },
  { id: 'flowchart', label: 'Flowchart' },
  { id: 'plot', label: 'Plot graph' },
  { id: 'quiz', label: 'Quiz maker' }
];

const LANGUAGES = [
  ['te', 'Telugu'],
  ['hi', 'Hindi'],
  ['ta', 'Tamil'],
  ['kn', 'Kannada'],
  ['ml', 'Malayalam'],
  ['bn', 'Bengali'],
  ['mr', 'Marathi'],
  ['en', 'English'],
  ['fr', 'French'],
  ['es', 'Spanish']
];

function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? iso : date.toLocaleString();
}

export default function App() {
  const { ready, cloudEnabled, userId, email, isGuest, signOut, exitGuest } = useAuth();

  const [tab, setTab] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [documents, setDocuments] = useState([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [logins, setLogins] = useState([]);
  const [history, setHistory] = useState([]);

  const [sourceText, setSourceText] = useState('');
  const [target, setTarget] = useState('te');
  const [translated, setTranslated] = useState('');

  const [code, setCode] = useState('def grade(marks):\n  if marks >= 75:\n    return "distinction"\n  return "pass"\n');
  const [mermaid, setMermaid] = useState('');

  const [xs, setXs] = useState('1,2,3,4,5');
  const [ys, setYs] = useState('2,4,6,8,10');

  const [quizText, setQuizText] = useState('');
  const [quizCount, setQuizCount] = useState(5);
  const [quiz, setQuiz] = useState([]);

  useEffect(() => {
    if (!userId) return;
    fetchLoginHistory(userId).then(setLogins);
    fetchQuestions(userId).then(setHistory);
  }, [userId]);

  const chunks = useMemo(() => buildChunks(documents), [documents]);
  const pages = useMemo(() => documents.filter((d) => d.page).length, [documents]);

  const handleFiles = async (event) => {
    const files = [...(event.target.files ?? [])];
    if (!files.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const parsed = [];
      for (const file of files) {
        const filePages = await extractPages(file);
        parsed.push(...filePages);
      }
      setDocuments(parsed);
      setAnswer(null);
      const words = parsed.reduce((sum, entry) => sum + entry.text.split(/\s+/).filter(Boolean).length, 0);
      setNotice(`Read ${parsed.length} page(s) and found about ${words.toLocaleString()} words of text.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that PDF.');
      setDocuments([]);
    } finally {
      setBusy(false);
    }
  };

  const handleAsk = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!chunks.length) {
      setError('Upload a PDF first — answers only come from your own pages.');
      return;
    }
    if (!question.trim()) {
      setError('Type a question.');
      return;
    }

    setBusy(true);
    try {
      const ranked = rankChunks(question, chunks, { topK: 5 });
      if (!ranked.length) {
        setAnswer(null);
        setError(
          `None of the words in your question appear in these pages. ` +
            'Ranking is keyword-based, so try the wording the document itself uses.'
        );
        return;
      }

      const passages = ranked.map((entry) => entry.chunk);
      const data = await askAboutPdf(question.trim(), passages);
      setAnswer({
        mode: data.mode,
        text: data.answer,
        passages: data.passages ?? passages,
        warning: data.warning ?? ''
      });

      if (userId) {
        await saveQuestion({
          user_id: userId,
          question: question.trim(),
          answer: data.answer,
          mode: data.mode,
          sources: (data.passages ?? passages).map((p) => ({ page: p.page ?? null, file: p.file ?? null }))
        });
        fetchQuestions(userId).then(setHistory);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The answer service is unreachable.');
    } finally {
      setBusy(false);
    }
  };

  const handleTranslate = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await translateText(sourceText, target);
      setTranslated(data.translated ?? '');
    } catch (err) {
      setTranslated('');
      setError(err instanceof Error ? err.message : 'Translation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleFlowchart = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await buildFlowchart(code);
      setMermaid(data.mermaid ?? '');
    } catch (err) {
      setMermaid('');
      setError(err instanceof Error ? err.message : 'Could not build the flowchart.');
    } finally {
      setBusy(false);
    }
  };

  const plot = useMemo(() => {
    const x = xs.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v));
    const y = ys.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v));
    if (x.length < 2 || x.length !== y.length) return null;

    const minX = Math.min(...x);
    const maxX = Math.max(...x);
    const minY = Math.min(...y);
    const maxY = Math.max(...y);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const points = x.map((value, index) => ({
      x: 40 + ((value - minX) / spanX) * 520,
      y: 180 - ((y[index] - minY) / spanY) * 150,
      label: `(${value}, ${y[index]})`
    }));
    return { points, minX, maxX, minY, maxY };
  }, [xs, ys]);

  const handleQuiz = (event) => {
    event.preventDefault();
    setError('');
    const sentences = quizText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => tokenize(s).length >= 3);

    if (!sentences.length) {
      setError('Paste a few full sentences from your notes first.');
      setQuiz([]);
      return;
    }

    const items = sentences.slice(0, Number(quizCount)).map((sentence) => {
      const words = sentence.split(/\s+/);
      const keywordIndex = words.reduce(
        (best, word, index) => {
          const clean = word.replace(/[^A-Za-z0-9]/g, '');
          const scored = clean.length >= 5 && tokenize(clean).length ? clean.length : 0;
          return scored > best.scored ? { index, scored } : best;
        },
        { index: -1, scored: 0 }
      );
      if (keywordIndex.index === -1) return null;
      const answer = words[keywordIndex.index].replace(/[^A-Za-z0-9]/g, '');
      const blanked = words
        .map((word, index) => (index === keywordIndex.index ? '________' : word))
        .join(' ');
      return { question: blanked, answer };
    });

    setQuiz(items.filter(Boolean));
  };

  if (!ready) {
    return <div className="app"><div className="main"><p className="muted">Loading StudyMate…</p></div></div>;
  }

  if (cloudEnabled && !userId && !isGuest) {
    return <AuthScreen />;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <h1>StudyMate</h1>
            <p>Ask your own PDFs — plus translate, flowchart and plot helpers</p>
          </div>
        </div>
        <div className="account">
          <span className="badge">{chunks.length ? `${chunks.length} chunk(s) indexed` : 'no PDF indexed'}</span>
          {userId ? (
            <>
              <span>{email}</span>
              <button type="button" className="btn" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <span className="badge">guest — nothing is saved</span>
              {cloudEnabled && (
                <button type="button" className="btn" onClick={exitGuest}>Sign in</button>
              )}
            </>
          )}
        </div>
      </header>

      <main className="main">
        <div>
          <div className="tabs">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={tab === entry.id ? 'active' : ''}
                onClick={() => { setTab(entry.id); setError(''); setNotice(''); }}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {tab === 'pdf' && (
            <section className="panel">
              <h2>Questions about your study material</h2>
              <p className="lede">
                The PDF is parsed in this browser and never uploaded. Answers are built only from
                the pages you load, so an unanswered question says so instead of inventing one.
              </p>

              <div className="field">
                <label htmlFor="pdf-files">Study PDFs</label>
                <input id="pdf-files" type="file" accept="application/pdf" multiple onChange={handleFiles} disabled={busy} />
              </div>

              {documents.length > 0 && (
                <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  {pages} page(s) from {new Set(documents.map((d) => d.file)).size} file(s) indexed for keyword search.
                </p>
              )}

              <form className="stack" onSubmit={handleAsk} style={{ marginTop: '1rem' }}>
                <div className="field">
                  <label htmlFor="pdf-question">Question</label>
                  <input
                    id="pdf-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="What does the chapter say about inertia?"
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Searching your pages…' : 'Ask'}
                </button>
              </form>

              {error && <p className="error">{error}</p>}
              {notice && <p className="notice">{notice}</p>}

              {answer && (
                <>
                  <div className="result">
                    <h3>
                      Answer
                      <span className="badge" style={{ marginLeft: '0.5rem' }}>
                        {answer.mode === 'model' ? 'language model' : 'quoted from your pages'}
                      </span>
                    </h3>
                    <p style={{ fontSize: '0.875rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{answer.text}</p>
                    {answer.mode !== 'model' && (
                      <p className="muted" style={{ fontSize: '0.6875rem', marginTop: '0.5rem' }}>
                        This deployment has no model key, so the closest passage is quoted verbatim. Set
                        LLM_API_BASE, LLM_API_KEY and LLM_MODEL to have it written as sentences.
                      </p>
                    )}
                    {answer.warning && <p className="error">{answer.warning}</p>}
                  </div>

                  <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5b6660', margin: '1rem 0 0.5rem' }}>
                    Where it came from
                  </h3>
                  {answer.passages.map((passage, index) => (
                    <div className="result" key={`${passage.file ?? 'p'}-${passage.page ?? index}`}>
                      <h3>
                        Passage {index + 1}
                        {passage.page ? <span className="muted" style={{ fontWeight: 400 }}> · page {passage.page} of {passage.file}</span> : null}
                      </h3>
                      <p style={{ fontSize: '0.75rem', lineHeight: 1.55, color: '#3f4b45' }}>{passage.text}</p>
                    </div>
                  ))}
                </>
              )}
            </section>
          )}

          {tab === 'translate' && (
            <section className="panel">
              <h2>Translate a passage</h2>
              <p className="lede">
                Routed through the free MyMemory endpoint, which is capped at roughly 5000 words a day
                for the whole deployment. Long texts are split at sentence-length gaps.
              </p>
              <form className="stack" onSubmit={handleTranslate}>
                <div className="field">
                  <label htmlFor="tr-text">Text to translate (English)</label>
                  <textarea
                    id="tr-text"
                    rows={6}
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    placeholder="Paste notes or a question."
                  />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="tr-target">Target language</label>
                    <select id="tr-target" value={target} onChange={(event) => setTarget(event.target.value)}>
                      {LANGUAGES.map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="tr-submit">&nbsp;</label>
                    <button id="tr-submit" type="submit" className="btn btn-primary" disabled={busy}>
                      {busy ? 'Translating…' : 'Translate'}
                    </button>
                  </div>
                </div>
              </form>
              {error && <p className="error">{error}</p>}
              {translated && (
                <div className="result" style={{ marginTop: '1rem' }}>
                  <h3>Translation</h3>
                  <p style={{ fontSize: '0.9375rem', lineHeight: 1.6 }}>{translated}</p>
                </div>
              )}
            </section>
          )}

          {tab === 'flowchart' && (
            <section className="panel">
              <h2>Python to flowchart</h2>
              <p className="lede">
                Real Python parsing, same as the desktop version: this only accepts Python source, not
                plain English. The result is Mermaid text — paste it into a Mermaid live editor to see
                the diagram.
              </p>
              <form className="stack" onSubmit={handleFlowchart}>
                <div className="field">
                  <label htmlFor="fc-code">Python code</label>
                  <textarea id="fc-code" rows={9} value={code} onChange={(event) => setCode(event.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Building…' : 'Generate flowchart'}
                </button>
              </form>
              {error && <p className="error">{error}</p>}
              {mermaid && (
                <div className="result" style={{ marginTop: '1rem' }}>
                  <h3>Mermaid</h3>
                  <pre style={{ fontSize: '0.6875rem', overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>{mermaid}</pre>
                </div>
              )}
            </section>
          )}

          {tab === 'plot' && (
            <section className="panel">
              <h2>Quick line plot</h2>
              <p className="lede">
                Drawn with SVG in the browser — no plotting library shipped, which is why this works on a
                free host at all.
              </p>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="plot-x">X values, comma separated</label>
                  <input id="plot-x" value={xs} onChange={(event) => setXs(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="plot-y">Y values, comma separated</label>
                  <input id="plot-y" value={ys} onChange={(event) => setYs(event.target.value)} />
                </div>
              </div>
              {plot ? (
                <svg viewBox="0 0 600 220" role="img" aria-label="Line plot of the values you entered" style={{ width: '100%', marginTop: '1rem', border: '1px solid #dfe5d8', borderRadius: '11px', background: '#fbfcf9' }}>
                  <line x1="40" y1="180" x2="570" y2="180" stroke="#c9d3c2" />
                  <line x1="40" y1="20" x2="40" y2="180" stroke="#c9d3c2" />
                  <polyline
                    points={plot.points.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="2"
                  />
                  {plot.points.map((point) => (
                    <circle key={point.label} cx={point.x} cy={point.y} r="3.5" fill="#14532d">
                      <title>{point.label}</title>
                    </circle>
                  ))}
                  <text x="40" y="205" fontSize="10" fill="#5b6660">{plot.minX}</text>
                  <text x="560" y="205" fontSize="10" fill="#5b6660" textAnchor="end">{plot.maxX}</text>
                  <text x="8" y="184" fontSize="10" fill="#5b6660">{plot.minY}</text>
                  <text x="8" y="28" fontSize="10" fill="#5b6660">{plot.maxY}</text>
                </svg>
              ) : (
                <p className="empty" style={{ marginTop: '1rem' }}>
                  Enter the same number of X and Y values, at least two of each.
                </p>
              )}
            </section>
          )}

          {tab === 'quiz' && (
            <section className="panel">
              <h2>Cloze quiz from your notes</h2>
              <p className="lede">
                Blanks out the longest word of each sentence. This is a mechanical cloze generator, exactly
                what the desktop version did — no model, no intelligence, and it will happily blank a word
                that carries no meaning.
              </p>
              <form className="stack" onSubmit={handleQuiz}>
                <div className="field">
                  <label htmlFor="quiz-text">Study text</label>
                  <textarea
                    id="quiz-text"
                    rows={7}
                    value={quizText}
                    onChange={(event) => setQuizText(event.target.value)}
                    placeholder="Paste a paragraph. Each sentence becomes one question."
                  />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="quiz-count">Questions</label>
                    <input id="quiz-count" type="number" min="1" max="20" value={quizCount} onChange={(event) => setQuizCount(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="quiz-submit">&nbsp;</label>
                    <button id="quiz-submit" type="submit" className="btn btn-primary">Generate</button>
                  </div>
                </div>
              </form>
              {error && <p className="error">{error}</p>}
              {quiz.length > 0 && (
                <ol style={{ paddingLeft: '1.25rem', fontSize: '0.8125rem', lineHeight: 1.7 }}>
                  {quiz.map((item, index) => (
                    <li key={`${item.answer}-${index}`}>
                      {item.question}
                      <details style={{ fontSize: '0.75rem', color: '#5b6660' }}>
                        <summary>Answer</summary>
                        {item.answer}
                      </details>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>

        <aside>
          <section className="panel">
            <h2>Your account</h2>
            {userId ? (
              <>
                <p className="lede">{email} — questions are saved to Supabase and follow you to any device.</p>
                <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5b6660', margin: '0.75rem 0 0.25rem' }}>
                  Recent sign-ins
                </h3>
                {logins.length ? (
                  <ul className="list">
                    {logins.slice(0, 6).map((row, index) => (
                      <li key={`${row.logged_at}-${index}`}>
                        <span>{formatTime(row.logged_at)}</span>
                        <span className="muted">{row.email}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">No sign-ins recorded yet.</p>
                )}

                <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5b6660', margin: '1rem 0 0.25rem' }}>
                  Saved questions
                </h3>
                {history.length ? (
                  <ul className="list">
                    {history.map((row, index) => (
                      <li key={`${row.asked_at}-${index}`}>
                        <span>{row.question}</span>
                        <span className="muted">{row.mode}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">Ask a question about a PDF and it appears here.</p>
                )}
              </>
            ) : (
              <p className="empty">
                You are browsing as a guest: nothing is stored, and this tab is the only copy of your work.
                Sign in to keep questions and see who used the tool.
              </p>
            )}
          </section>
        </aside>
      </main>

      <footer className="footer">
        StudyMate · PDF parsing and retrieval run locally in your browser · the server only handles translation,
        flowcharts and optional language-model answers · the original Streamlit version lives in{' '}
        <code>streamlit_app/</code>
      </footer>
    </div>
  );
}
