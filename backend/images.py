"""Copyright-free image search: Pexels → Unsplash → Pixabay → generated SVG.
Returns {url, alt, source} or [] when nothing configured / found."""
from __future__ import annotations

import json
import urllib.parse
import urllib.request

from backend.providers import CONFIG

UA = {"User-Agent": "VidForge/1.0 (research video generator)"}


def search_images(query: str, n: int = 3) -> list[dict]:
    try:
        if CONFIG["pexels_key"]:
            return _pexels(query, n)
        if CONFIG["unsplash_key"]:
            return _unsplash(query, n)
        if CONFIG["pixabay_key"]:
            return _pixabay(query, n)
    except Exception as e:
        print(f"[providers] image search failed ({e})")
    return []


def _pexels(query, n):
    url = f"https://api.pexels.com/v1/search?query={urllib.parse.quote(query)}&per_page={n}"
    req = urllib.request.Request(url, headers={**UA, "Authorization": CONFIG["pexels_key"]})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read().decode())
    return [
        {"url": p["src"]["large"], "alt": p.get("alt", query), "source": "pexels"}
        for p in data.get("photos", [])[:n]
    ]


def _unsplash(query, n):
    url = f"https://api.unsplash.com/search/photos?query={urllib.parse.quote(query)}&per_page={n}"
    req = urllib.request.Request(url, headers={**UA, "Authorization": f"Client-ID {CONFIG['unsplash_key']}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read().decode())
    return [
        {"url": p["urls"]["regular"], "alt": p.get("alt_description") or query, "source": "unsplash"}
        for p in data.get("results", [])[:n]
    ]


def _pixabay(query, n):
    url = (f"https://pixabay.com/api/?key={CONFIG['pixabay_key']}"
           f"&q={urllib.parse.quote(query)}&per_page={n}&image_type=photo")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read().decode())
    return [
        {"url": h["webformatURL"], "alt": h.get("tags", query), "source": "pixabay"}
        for h in data.get("hits", [])[:n]
    ]


def svg_background(seed: str, hue: int | None = None) -> str:
    """Deterministic generated gradient background (no API needed)."""
    import hashlib
    h = int(hashlib.md5(seed.encode()).hexdigest()[:6], 16)
    h1 = h % 360
    h2 = (h1 + 40) % 360
    return (f"linear-gradient(135deg, hsl({h1},45%,22%), hsl({h2},55%,12%))")
