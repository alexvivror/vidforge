#!/bin/bash
# End-to-end test: create project, check outline quality, timeline, marp
sleep 3
cd /opt/data/vidforge
B=http://localhost:8080

echo "=== 1. CREATE PROJECT (article URL) ==="
RESP=$(curl -s -m 90 -X POST $B/api/projects -H "Content-Type: application/json" -d '{"source_type":"url","source":"https://en.wikipedia.org/wiki/Photosynthesis","style":"documentary","title":"Photosynthesis Explained"}')
echo "$RESP" | /opt/data/vidforge-venv/bin/python3 -c "
import json,sys
d = json.load(sys.stdin)
print('id:', d['id'], '| status:', d['status'], '| style:', d['style'], '| provider:', d.get('script_provider'))
print('slides:', len(d['outline']), '| words:', d['word_count'], '| duration:', d['duration'])
for i, s in enumerate(d['outline'], 1):
    print(f'  slide {i}: [{s[\"heading\"][:50]}] img={s[\"image\"][\"source\"]}')
print('script (first 200):', d['script'][:200])
print('PID=' + d['id'])
" | tee /tmp/vf-test.txt
PID=$(grep -oP 'PID=\K.*' /tmp/vf-test.txt | head -1)

echo ""
echo "=== 2. TIMELINE (word count) ==="
curl -s -m 15 $B/api/projects/$PID/timeline | /opt/data/vidforge-venv/bin/python3 -c "import json,sys; d=json.load(sys.stdin); print('words:', len(d['words']), '| first:', d['words'][:2], '| duration:', d['duration'])"

echo ""
echo "=== 3. PRESENTATION (marp) ==="
curl -s -m 30 $B/api/projects/$PID/presentation | /opt/data/vidforge-venv/bin/python3 -c "import json,sys; d=json.load(sys.stdin); print('marp chars:', len(d['marp']), '| html:', 'YES' if d.get('html') else 'NO (marp-cli unavailable)'); print('marp head:', d['marp'][:120].replace(chr(10),' | '))"

echo ""
echo "=== 4. RESTYLE ==="
curl -s -m 30 -X POST "$B/api/projects/$PID/script?style=fast_youtube" | /opt/data/vidforge-venv/bin/python3 -c "import json,sys; d=json.load(sys.stdin); print('new style:', d['style'], '| words:', d['word_count'])"

echo ""
echo "=== 5. TTS (should fall back to browser) ==="
curl -s -m 30 -X POST "$B/api/projects/$PID/tts" | /opt/data/vidforge-venv/bin/python3 -c "import json,sys; d=json.load(sys.stdin); print('provider:', d['provider'], '| audio:', d.get('audio_url'), '| note:', d.get('note'))"
