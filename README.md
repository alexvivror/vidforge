# VidForge AI

Turn any research paper, article, PDF, or raw text into a **narrated video** —
slides, creator-style script, live word-highlighted narration, and sound
effects — right in the browser.

## How it works

1. **Input** — paste text, an article URL, or upload a PDF
2. **Analysis** — extractive summarizer (or LLM) builds a 4-6 slide outline
3. **Script** — creator-style narration (Educational / Fast YouTube / Documentary / Research / Explainer / News)
4. **Slides** — generated with a Marp deck + styled slide stage
5. **Playback** — word-by-word highlighting synced to narration, sound effects via Web Audio, slide transitions on the timeline

## Providers (all optional — free fallbacks built in)

| Capability | Free default | With API key |
|-----------|--------------|--------------|
| Script generation | builtin extractive | OpenCode Zen / Pollinations (`OPENCODEZEN_API_KEY`) |
| Text-to-speech | browser speechSynthesis | ElevenLabs (`ELEVENLABS_API_KEY`) / NVIDIA NIM (`NVIDIA_NIM_API_KEY`) |
| Images | generated gradients | Pexels / Unsplash / Pixabay |
| Article fetch | trafilatura | Firecrawl (`FIRECRAWL_API_KEY`) |
| Avatar | CSS presenter | NVIDIA NIM + Wav2Lip (GPU box) |

## Run locally

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python -m uvicorn backend.main:app --port 8080
# open http://localhost:8080
```

## API

- `POST /api/projects` — `{source_type: text|url, source, style, title}`
- `GET  /api/projects/{id}` — state, outline, script
- `POST /api/projects/{id}/script?style=fast_youtube` — re-style
- `POST /api/projects/{id}/tts` — synthesize (elevenlabs/nim) or mark browser
- `GET  /api/projects/{id}/timeline` — word-timed narration
- `GET  /api/projects/{id}/presentation` — Marp markdown + HTML deck
- `GET  /api/status` — active providers

## Deploy

Push to GitHub → Render → **New → Blueprint** (render.yaml is included).
