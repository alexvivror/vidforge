"""TTS providers: ElevenLabs → NVIDIA NIM → browser speechSynthesis (default).
Audio endpoints return a URL the browser can play; the word timeline is
always produced so the frontend can highlight in sync."""
from __future__ import annotations

import json
import urllib.request

from backend.providers import CONFIG


def tts_provider() -> str:
    if CONFIG["elevenlabs_key"]:
        return "elevenlabs"
    if CONFIG["nvidia_nim_key"]:
        return "nvidia_nim"
    return "browser"


def elevenlabs_synthesize(text: str, voice: str | None = None) -> tuple[str, str]:
    """Returns (audio_url, provider). Audio URL is the ElevenLabs endpoint the
    browser can stream directly (needs the key client-side too, so we proxy it
    through /api/tts/proxy)."""
    voice = voice or CONFIG["elevenlabs_voice"]
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}"
    payload = {"text": text, "model_id": "eleven_multilingual_v2",
               "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "xi-api-key": CONFIG["elevenlabs_key"],
                                          "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=60) as r:
        audio = r.read()
    # store on disk; served back through /api/tts/audio/{pid}
    return audio, "elevenlabs"


def nim_synthesize(text: str) -> tuple[bytes, str]:
    """NVIDIA NIM TTS (e.g. nvidia/parakeet or a hosted TTS NIM). The exact
    endpoint/model depends on the NIM deployment; this targets the NVIDIA
    hosted API shape."""
    url = "https://ai.api.nvidia.com/v1/audio/speech"
    payload = {"model": "nvidia/tts", "input": text, "voice": "en-US-JennyNeural"}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {CONFIG['nvidia_nim_key']}",
                                          "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), "nvidia_nim"
