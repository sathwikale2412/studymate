"""Checks the StudyMate helper service's own decisions, with no model or translation call.

_answer, translate and the catalogue lookups are replaced so the assertions cover input
limits, the rate window, and what a caller is told when an upstream service fails.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import index  # noqa: E402

results = []


def check(label, ok, detail=''):
    print(f'{"PASS" if ok else "FAIL"} {detail}')
    results.append(ok)


client = index.app.test_client()

health = client.get('/api/health').get_json()
check('health states the answer mode', health['answer'] in ('model', 'extractive'), health)

check('empty question refused',
      client.post('/api/answer', json={'question': '  '}).status_code == 400)
too_long = client.post('/api/answer',
                       json={'question': 'x' * (index.MAX_QUESTION_CHARS + 1),
                             'passages': ['a passage']})
check('oversized question refused', too_long.status_code == 413, too_long.get_json()['message'])
check('oversized translation refused',
      client.post('/api/translate', json={'text': 'x' * 6000}).status_code == 413)
check('empty flowchart refused',
      client.post('/api/flowchart', json={'code': '  '}).status_code == 400)

index.llm_ready = lambda: True


def model_boom(*a, **k):
    raise RuntimeError('401 Client Error for https://api.fake.dev/v1/chat?key=SECRETVALUE')


index._model_answer = model_boom
fallback = client.post('/api/answer',
                       json={'question': 'What is a market?',
                             'passages': ['A market is a place where buyers and sellers meet.']})
body = fallback.get_json()
check('model failure falls back to the passages',
      fallback.status_code == 200 and body['mode'] == 'extractive', str(body)[:70])
for phrase in ('SECRETVALUE', 'RuntimeError', 'fake.dev', '401'):
    check(f'fallback hides {phrase!r}', phrase not in str(body))
check('fallback keeps a ref for the log', len(body.get('ref', '')) == 8)

index.translate = lambda *a, **k: (_ for _ in ()).throw(
    RuntimeError('too many requests from 57.12.34.56 on api.mymemory.translated.net'))
refused = client.post('/api/translate', json={'text': 'hello', 'source': 'en', 'target': 'te'})
body = refused.get_json()
check('translation failure is 502 with one sentence',
      refused.status_code == 502
      and body['message'] == 'The translation service did not answer. Try again shortly.')
for phrase in ('mymemory', '57.12', 'RuntimeError', 'too many requests'):
    check(f'translation failure hides {phrase!r}', phrase not in str(body))

index._hits.clear()
codes = [client.post('/api/translate', json={'text': 'x'}).status_code
         for _ in range(index.RATE_MAX_REQUESTS + 2)]
check('rate limit trips after the window budget', codes.count(429) == 2,
      f'{codes.count(502)} served, {codes.count(429)} refused')

index._hits.clear()
broken = client.post('/api/flowchart', json={'code': 'def (: pass'})
check('a syntax problem is reported readably',
      broken.status_code == 400 and 'valid Python' in broken.get_json()['message'])

print(f'\n{sum(results)}/{len(results)} checks passed')
sys.exit(0 if all(results) else 1)
