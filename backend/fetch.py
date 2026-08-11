"""Article fetching: Firecrawl → trafilatura fallback."""
from __future__ import annotations

import json
import urllib.request

from backend.providers import CONFIG


def fetch_article(url: str) -> tuple[str, str]:
    """Returns (text, provider)."""
    if CONFIG["firecrawl_key"]:
        try:
            text = _firecrawl(url)
            if len(text.strip()) > 40:
                return text, "firecrawl"
        except Exception as e:
            print(f"[providers] firecrawl failed ({e}), falling back to trafilatura")
    try:
        import trafilatura
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            text = trafilatura.extract(downloaded, include_comments=False)
            if text and len(text.strip()) > 40:
                return text, "trafilatura"
    except Exception as e:
        print(f"[providers] trafilatura failed: {e}")
    raise RuntimeError(f"Could not extract article from {url}")


def _firecrawl(url: str) -> str:
    payload = {"url": url, "formats": ["markdown"], "onlyMainContent": True}
    req = urllib.request.Request(
        "https://api.firecrawl.dev/v1/scrape",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {CONFIG['firecrawl_key']}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode())
    return data.get("data", {}).get("markdown", "") or ""
