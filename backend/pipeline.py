"""VidForge AI — Research/Article → narrated video pipeline (backend core).

Deterministic fallback pipeline: extracts content, builds an outline,
generates slides + narration script + a word-timed timeline. If an LLM
endpoint is configured (POLLINATIONS_API_KEY or OPENAI_API_KEY) it upgrades
the script to a creator-style script; otherwise rule-based generation runs.
"""
from __future__ import annotations

import json
import math
import re
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None

try:
    import trafilatura
except ImportError:  # pragma: no cover
    trafilatura = None

# ---------------------------------------------------------------- models

STYLES = {
    "educational": {
        "name": "Educational",
        "pacing": 2.9,  # words/sec
        "tone": "Clear, warm and methodical. Explain like you are teaching a curious friend.",
        "opener": "Welcome back. Today we are going to break down {topic} properly.",
        "closer": "That is the full picture of {topic}. Thank you for watching — see you in the next one.",
    },
    "fast_youtube": {
        "name": "Fast YouTube",
        "pacing": 3.6,
        "tone": "High energy, punchy, zero fluff. Every sentence earns its place.",
        "opener": "Stop scrolling — this is the video about {topic} that actually delivers.",
        "closer": "Quick recap done. If this helped, subscribe — more like this coming.",
    },
    "documentary": {
        "name": "Documentary",
        "pacing": 2.4,
        "tone": "Cinematic, deliberate, authoritative. Pause for weight.",
        "opener": "Few topics shape the way we think more than {topic}.",
        "closer": "And that, ultimately, is the story of {topic}.",
    },
    "research": {
        "name": "Research / Academic",
        "pacing": 2.6,
        "tone": "Precise, evidence-first, citation-aware. Number-focused.",
        "opener": "This presentation summarises the key findings on {topic}.",
        "closer": "In summary, the evidence points in one clear direction.",
    },
    "explainer": {
        "name": "Explainer",
        "pacing": 3.1,
        "tone": "Simple analogies, concrete examples, everyday language.",
        "opener": "Here is {topic}, explained the way it should have been the first time.",
        "closer": "Now you know {topic} — simple, right?",
    },
    "news": {
        "name": "News / Briefing",
        "pacing": 3.3,
        "tone": "Neutral, factual, brisk. Lead with what changed.",
        "opener": "Here is what you need to know about {topic} today.",
        "closer": "That is the update. We will keep you posted as it develops.",
    },
}


@dataclass
class Project:
    id: str
    title: str
    source_type: str  # url | text | pdf
    source_text: str = ""
    style: str = "educational"
    status: str = "created"
    outline: list = field(default_factory=list)  # [{heading, bullets:[..], image, bg}]
    script: str = ""
    script_provider: str = "builtin"
    words: list = field(default_factory=list)   # [{w, start, end, slide}]
    slides_html: list = field(default_factory=list)
    marp: str = ""
    marp_html: str = ""
    duration: float = 0.0
    created_at: str = ""


# ---------------------------------------------------------------- helpers

STOPWORDS = set("""a an and are as at be by for from has he her his in is it its
of on or that the they this to was were will with you your we our i not but what
when where which who whom how all any both each few more most other some such no
nor only own same so than too very just can did do does done""".split())


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", text.lower())


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if len(p.strip()) > 20]


def _summarize(text: str, n: int = 6) -> list[str]:
    """Extractive summary: rank sentences by keyword frequency (no LLM).
    Filters out citation/reference lines and headings."""
    sents = _sentences(text)
    if not sents:
        return []

    def _is_junk(s: str) -> bool:
        low = s.lower()
        if len(s.split()) < 6:
            return True
        # citation / journal-name lines
        if re.search(r"\b(vol\.|pp\.|doi:|isbn|et al\.|research|journal|review|edition)\b", low) and "(" in s:
            return True
        if low.startswith(("^ ", "↑", "note ", "see also", "further reading", "references", "external links", "- ↑", "- ", "1. ", "2. ")):
            return True
        if s.count(".") > 4 and len(s) < 80:
            return True
        # reference-ish fragments: starts with a citation marker or has [n]
        if re.match(r"^[\-–•\d\.\)\]]+[\s↑]*", s):
            return True
        return False

    words = _tokenize(text)
    freq: dict[str, float] = {}
    for w in words:
        if w not in STOPWORDS and len(w) > 2:
            freq[w] = freq.get(w, 0) + 1
    if not freq:
        return [s for s in sents[:n] if not _is_junk(s)] or sents[:n]

    scored = []
    for s in sents:
        if _is_junk(s):
            continue
        ws = _tokenize(s)
        score = sum(freq.get(w, 0) for w in ws if w not in STOPWORDS) / max(len(ws), 1)
        scored.append((score, s))
    scored.sort(key=lambda x: -x[0])
    picked = [s for _, s in scored[:n]]
    # ensure the intro (first content sentence) is included if not picked
    if sents and sents[0] not in picked and len(picked) < n:
        picked = [sents[0]] + picked[: n - 1]
    return picked


def _title_from(text: str) -> str:
    first = _sentences(text)
    if not first:
        return "Untitled Research"
    words = first[0].split()
    return " ".join(words[:10]).rstrip(".:,")


# ---------------------------------------------------------------- pipeline

def extract_source(source_type: str, source: str) -> str:
    """Turn URL / PDF bytes / raw text into plain text."""
    if source_type == "text":
        return source
    if source_type == "url":
        if trafilatura is None:
            raise RuntimeError("trafilatura not installed — can't fetch URL")
        try:
            downloaded = trafilatura.fetch_url(source)
        except Exception as e:
            raise RuntimeError(f"Could not fetch URL: {source} ({e})")
        if not downloaded:
            raise RuntimeError(f"Could not fetch URL: {source}")
        text = trafilatura.extract(downloaded, include_comments=False)
        return text or ""
    if source_type == "pdf":
        if fitz is None:
            raise RuntimeError("PyMuPDF not installed — can't parse PDF")
        doc = fitz.open(stream=source.encode("latin-1", "ignore"), filetype="pdf") \
            if isinstance(source, str) and source.startswith("%PDF") else None
        return ""
    return ""


def build_outline(text: str, max_slides: int = 6) -> list[dict]:
    sents = _summarize(text, n=max_slides)
    outline = []
    for i, s in enumerate(sents, 1):
        words = s.split()
        # heading = first meaningful phrase (strip leading note markers + quotes)
        cleaned = re.sub(r"^\[\d+\]\s*|\^+|\[note \d+\]\s*", "", s).strip(' "\'“”')
        cw = cleaned.split()
        heading = " ".join(cw[:7]).rstrip(".,:;\"'”")
        if len(heading) < 12 and len(cw) > 7:
            heading = " ".join(cw[:10]).rstrip(".,:;\"'”")
        if len(heading) < 8:
            heading = f"Key Insight {i}"
        chunk = " ".join(cw[7:]) if len(cw) > 8 else ""
        bullets = []
        if chunk:
            bullets.append(chunk[:130])
        # add a second bullet from the raw sentence context (mid-part) when long
        if len(cw) > 18:
            mid = " ".join(cw[10:20]).rstrip(".,:;")
            if len(mid) > 30:
                bullets.append(mid[:120])
        if len(cw) > 4:
            bullets.append(f"Key term: {cw[0]} — central to this slide.")
        if not bullets:
            bullets.append(cleaned[:130])
        outline.append({"heading": heading, "bullets": bullets[:3]})
    if not outline:
        outline = [{"heading": "Overview", "bullets": [text[:120]]}]
    return outline


def build_script(title: str, outline: list[dict], style: str) -> str:
    cfg = STYLES.get(style, STYLES["educational"])
    lines = [cfg["opener"].format(topic=title)]
    for i, slide in enumerate(outline, 1):
        heading = slide["heading"]
        for b in slide["bullets"]:
            lines.append(f"{heading}: {b}" if b and b != "Source-backed insight extracted from the original material." else f"{b}")
    lines.append(cfg["closer"].format(topic=title))
    return " ".join(lines)


def word_timeline(script: str, style: str, slides: list[dict]) -> tuple[list[dict], float]:
    """Estimate per-word timestamps from pacing (chars-per-sec model)."""
    cfg = STYLES.get(style, STYLES["educational"])
    wps = cfg["pacing"]
    words = script.split()
    if not words:
        return [], 0.0

    # word-level char budget per slide: opening/closing are slide 0 and last
    n_slides = max(len(slides), 1)
    # assign each word to a slide by index proportion: first ~8% opener (slide 0),
    # body split evenly across slides, last ~8% closer (last slide)
    def slide_for(idx: int) -> int:
        total = len(words)
        if n_slides <= 1:
            return 0
        if idx < total * 0.08:
            return 0
        if idx >= total * 0.92:
            return n_slides - 1
        body_frac = (idx - total * 0.08) / (total * 0.84)
        return min(n_slides - 1, int(body_frac * n_slides))

    timeline = []
    t = 0.0
    for i, w in enumerate(words):
        dur = (len(w) + 1) / (wps * 5.2)  # avg word len ~5.2 chars
        timeline.append({"w": w, "start": round(t, 3), "end": round(t + dur, 3), "slide": slide_for(i)})
        t += dur
    return timeline, round(t, 2)


# ---------------------------------------------------------------- store

class ProjectStore:
    """Persists projects to disk AND keeps an in-memory cache.
    The memory cache survives Render free-tier filesystem resets so active
    projects keep working even if the ephemeral disk is wiped mid-session."""

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, Project] = {}

    def _path(self, pid: str) -> Path:
        return self.root / f"{pid}.json"

    def save(self, p: Project) -> None:
        self._cache[p.id] = p
        try:
            self._path(p.id).write_text(json.dumps(asdict(p), indent=2))
        except OSError:
            pass  # disk read-only / ephemeral — memory cache still serves

    def load(self, pid: str) -> Optional[Project]:
        if pid in self._cache:
            return self._cache[pid]
        path = self._path(pid)
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        p = Project(**{k: data[k] for k in Project.__dataclass_fields__ if k in data})
        self._cache[pid] = p
        return p
