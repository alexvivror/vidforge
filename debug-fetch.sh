#!/bin/bash
cd /opt/data/vidforge
/opt/data/vidforge-venv/bin/python3 -c "
from backend import pipeline, fetch
text, prov = fetch.fetch_article('https://en.wikipedia.org/wiki/Photosynthesis')
print('provider:', prov, '| text len:', len(text))
print('---first 300 chars---')
print(text[:300])
sents = pipeline._sentences(text)
print('---sentences:', len(sents))
print('---top summarized---')
summ = pipeline._summarize(text, n=6)
for s in summ:
    print(' *', s[:100])
"
