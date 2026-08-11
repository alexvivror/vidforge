"""Marp-based presentation generation: outline → Marp markdown → HTML slides."""
from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

MARPS = [
    "npx", "--yes", "@marp-team/marp-cli@latest", "--html", "--allow-local-files",
]


def outline_to_marp(title: str, outline: list[dict], style: str) -> str:
    """Render outline as Marp markdown (dark theme, brand accent)."""
    accent = "#F5C518"
    bg = "#12121E"
    lines = [
        "---",
        "marp: true",
        "theme: default",
        "size: 16:9",
        "paginate: false",
        f"style: |",
        f"  section {{ background: {bg}; color: #ECECF2; font-family: Inter, sans-serif; padding: 56px 64px; }}",
        f"  h1 {{ color: #fff; font-size: 44px; margin-bottom: 16px; }}",
        f"  h2 {{ color: {accent}; font-size: 20px; text-transform: uppercase; letter-spacing: 1.5px; }}",
        f"  li {{ font-size: 26px; line-height: 1.6; margin: 12px 0; }}",
        f"  strong {{ color: {accent}; }}",
        "---",
        "",
        f"# {title}",
        "",
        f"**{style.replace('_', ' ').title()}** · VidForge AI",
        "",
    ]
    for i, slide in enumerate(outline, 1):
        lines.append("---")
        lines.append("")
        lines.append(f"## Slide {i}")
        lines.append("")
        lines.append(f"### {slide['heading']}")
        lines.append("")
        for b in slide["bullets"]:
            lines.append(f"- {b}")
        lines.append("")
    return "\n".join(lines)


def marp_to_html(markdown: str) -> str | None:
    """Convert Marp markdown to a self-contained HTML deck via marp-cli."""
    with tempfile.TemporaryDirectory() as tmp:
        md = Path(tmp) / "deck.md"
        md.write_text(markdown)
        try:
            r = subprocess.run(
                MARPS + [str(md), "-o", str(Path(tmp) / "deck.html")],
                capture_output=True, text=True, timeout=120,
            )
            if r.returncode != 0:
                print(f"[marp] failed: {r.stderr[-300:]}")
                return None
            html = (Path(tmp) / "deck.html").read_text()
            return html
        except FileNotFoundError:
            print("[marp] npx/node not available")
            return None
        except Exception as e:
            print(f"[marp] error: {e}")
            return None


def build_presentation(title: str, outline: list[dict], style: str) -> dict:
    """Returns {marp, html} — html may be None if marp-cli unavailable."""
    md = outline_to_marp(title, outline, style)
    html = marp_to_html(md)
    return {"marp": md, "html": html, "slides": len(outline), "title": title}
