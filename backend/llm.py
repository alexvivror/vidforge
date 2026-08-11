"""LLM script generation via OpenCode Zen (OpenAI-compatible) or Pollinations.
Falls back to deterministic extractive generation (pipeline.build_script)."""
from __future__ import annotations

import json
import urllib.request

from backend import pipeline
from backend.providers import CONFIG

SYSTEM_PROMPT = """You are a video script writer. Given a research outline, write a
narration script for a {style} video. Requirements:
- Natural spoken language (no markdown, no headings, no bullet symbols)
- Exactly ONE flowing paragraph per slide, each sentence on its own line
- Keep numbers and technical terms exact
- Opening hook + closing CTA
- Total 120-220 words
Return ONLY the script text."""


def _call_opencodezen(outline, style, title):
    payload = {
        "model": CONFIG["opencodezen_model"],
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT.format(style=style)},
            {"role": "user", "content": json.dumps({"title": title, "outline": outline}, indent=1)},
        ],
        "temperature": 0.7,
        "max_tokens": 600,
    }
    req = urllib.request.Request(
        CONFIG["opencodezen_base"] + "/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {CONFIG['opencodezen_key']}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode())
    return data["choices"][0]["message"]["content"].strip()


def _call_pollinations(outline, style, title):
    prompt = f"""Write a {style} narration script (120-220 words, one sentence per line, no markdown) for a video about "{title}" with these slides: {json.dumps(outline)}"""
    url = "https://text.pollinations.ai/" + urllib.parse.quote(prompt)
    req = urllib.request.Request(url, headers={"User-Agent": "VidForge/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode().strip()


def generate_script(outline, style, title) -> tuple[str, str]:
    """Returns (script, provider_used)."""
    try:
        if CONFIG["opencodezen_key"]:
            return _call_opencodezen(outline, style, title), "opencodezen"
        if CONFIG["pollinations_key"]:
            return _call_pollinations(outline, style, title), "pollinations"
    except Exception as e:
        print(f"[providers] LLM failed ({e}), falling back to extractive")
    return pipeline.build_script(title, outline, style), "builtin-extractive"
