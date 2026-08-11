"""VidForge AI — FastAPI server (full provider stack).

API:
  POST /api/projects            create project (text|url|pdf) + images + marp
  GET  /api/projects/{id}       project state
  POST /api/projects/{id}/script     regenerate script with a style
  POST /api/projects/{id}/tts        synthesize audio (elevenlabs/nim) or mark browser
  GET  /api/projects/{id}/tts/audio  serve synthesized audio
  GET  /api/projects/{id}/timeline   word-timed narration timeline
  GET  /api/projects/{id}/slides     slide HTML fragments + images
  GET  /api/projects/{id}/presentation   Marp markdown + html deck
  GET  /api/status               provider status
Serves the single-page web app at /.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend import pipeline, fetch, images, llm, marp_pres, tts, providers
from backend.pipeline import Project, ProjectStore, STYLES

ROOT = Path(__file__).resolve().parent.parent
STORE = ProjectStore(ROOT / "data")
AUDIO_DIR = ROOT / "data" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
FRONTEND = ROOT / "frontend"

app = FastAPI(title="VidForge AI", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if FRONTEND.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND)), name="static")


# ---------------------------------------------------------------- models

class ProjectCreate(BaseModel):
    source_type: str = "text"   # text | url
    source: str = ""
    style: str = "educational"
    title: str = ""


# ---------------------------------------------------------------- routes

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "vidforge", "styles": list(STYLES.keys())}


@app.get("/api/status")
def status():
    return {"providers": providers.provider_status()}


@app.post("/api/projects")
def create_project(body: ProjectCreate):
    if not body.source.strip():
        raise HTTPException(400, "source is required")
    if body.style not in STYLES:
        raise HTTPException(400, f"unknown style; choose from {list(STYLES.keys())}")

    pid = uuid.uuid4().hex[:12]
    proj = Project(
        id=pid,
        title=body.title or "Untitled",
        source_type=body.source_type,
        style=body.style,
        status="analyzing",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    STORE.save(proj)

    try:
        text = pipeline.extract_source(body.source_type, body.source)
        if len(text.strip()) < 40:
            raise HTTPException(400, "Could not extract enough content from the source.")
        proj.source_text = text[:20000]
        proj.title = body.title or pipeline._title_from(text)
        proj.outline = pipeline.build_outline(text, max_slides=6)
        proj.script, proj.script_provider = llm.generate_script(proj.outline, proj.style, proj.title)
        proj.words, proj.duration = pipeline.word_timeline(proj.script, proj.style, proj.outline)
        # enrich each slide with a copyright-free image or generated gradient
        for i, slide in enumerate(proj.outline):
            imgs = images.search_images(slide["heading"], n=1)
            slide["image"] = imgs[0] if imgs else {"url": None, "source": "generated"}
            slide["bg"] = images.svg_background(proj.title + str(i))
        proj.marp, proj.marp_html = _build_marp(proj)
        proj.status = "ready"
        STORE.save(proj)
    except HTTPException:
        proj.status = "failed"
        STORE.save(proj)
        raise
    except Exception as e:
        proj.status = "failed"
        STORE.save(proj)
        raise HTTPException(500, f"Processing failed: {e}")

    return _project_view(proj)


def _build_marp(proj):
    pres = marp_pres.build_presentation(proj.title, proj.outline, proj.style)
    return pres["marp"], pres["html"]


@app.post("/api/projects/upload")
async def upload_project(file: UploadFile = File(...), style: str = Form("educational")):
    data = await file.read()
    try:
        text = data.decode("utf-8", errors="ignore")
    except Exception:
        text = ""
    if file.filename.lower().endswith(".pdf") and len(text) < 40:
        import re
        chunks = re.findall(rb"\(([^()]{10,})\)", data)
        text = " ".join(c.decode("latin-1", "ignore") for c in chunks)[:20000]
    if len(text.strip()) < 40:
        raise HTTPException(400, "Could not read text from the uploaded file.")
    body = ProjectCreate(source_type="text", source=text, style=style,
                         title=file.filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " "))
    return create_project(body)


@app.post("/api/projects/{pid}/script")
def regenerate_script(pid: str, style: str = "educational"):
    proj = STORE.load(pid)
    if not proj:
        raise HTTPException(404, "project not found")
    if style not in STYLES:
        raise HTTPException(400, "unknown style")
    proj.style = style
    proj.script, proj.script_provider = llm.generate_script(proj.outline, style, proj.title)
    proj.words, proj.duration = pipeline.word_timeline(proj.script, style, proj.outline)
    proj.marp, proj.marp_html = _build_marp(proj)
    STORE.save(proj)
    return _project_view(proj)


@app.post("/api/projects/{pid}/tts")
def synthesize(pid: str, voice: str = ""):
    """Generate TTS audio with elevenlabs/nim; else mark for browser TTS."""
    proj = STORE.load(pid)
    if not proj:
        raise HTTPException(404, "project not found")
    provider = tts.tts_provider()
    audio = None
    if provider == "elevenlabs":
        audio, _ = tts.elevenlabs_synthesize(proj.script, voice or None)
        (AUDIO_DIR / f"{pid}.mp3").write_bytes(audio)
    elif provider == "nvidia_nim":
        audio, _ = tts.nim_synthesize(proj.script)
        (AUDIO_DIR / f"{pid}.mp3").write_bytes(audio)
    return {
        "provider": provider,
        "audio_url": f"/api/projects/{pid}/tts/audio" if audio else None,
        "note": "browser speechSynthesis will be used" if not audio else "audio ready",
    }


@app.get("/api/projects/{pid}/tts/audio")
def tts_audio(pid: str):
    path = AUDIO_DIR / f"{pid}.mp3"
    if not path.exists():
        raise HTTPException(404, "no audio generated")
    return Response(path.read_bytes(), media_type="audio/mpeg")


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    proj = STORE.load(pid)
    if not proj:
        raise HTTPException(404, "project not found")
    return _project_view(proj)


@app.get("/api/projects/{pid}/timeline")
def get_timeline(pid: str):
    proj = STORE.load(pid)
    if not proj:
        raise HTTPException(404, "project not found")
    return {"project_id": pid, "duration": proj.duration, "words": proj.words}


@app.get("/api/projects/{pid}/slides")
def get_slides(pid: str):
    proj = STORE.load(pid)
    if not proj:
        raise HTTPException(404, "project not found")
    return {"project_id": pid, "title": proj.title, "slides": proj.outline}


@app.get("/api/projects/{pid}/presentation")
def get_presentation(pid: str):
    proj = STORE.load(pid)
    if not proj:
        raise HTTPException(404, "project not found")
    return {"project_id": pid, "title": proj.title, "marp": proj.marp, "html": proj.marp_html}


def _project_view(p: Project) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "style": p.style,
        "status": p.status,
        "outline": p.outline,
        "script": p.script,
        "script_provider": getattr(p, "script_provider", "builtin"),
        "word_count": len(p.words),
        "duration": p.duration,
        "created_at": p.created_at,
        "styles": list(STYLES.keys()),
        "providers": providers.provider_status(),
    }


@app.get("/")
def index():
    idx = FRONTEND / "index.html"
    if idx.exists():
        return FileResponse(str(idx))
    return JSONResponse({"error": "frontend not built"}, status_code=404)
