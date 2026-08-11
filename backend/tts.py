"""TTS providers: ElevenLabs → NVIDIA NIM → browser speechSynthesis (default).
Audio endpoints return a URL the browser can play; the word timeline is
always produced so the frontend can highlight in sync."""
from __future__ import annotations

import json
import urllib.request

from backend.providers import CONFIG


def tts_provider(cfg=None) -> str:
    if cfg is None:
        cfg = CONFIG
    if cfg["elevenlabs_key"]:
        return "elevenlabs"
    if cfg["nvidia_nim_key"]:
        return "nvidia_nim"
    return "browser"


def elevenlabs_synthesize(text: str, voice: str | None = None, cfg=None) -> tuple[bytes, str]:
    """Returns (audio_bytes, provider)."""
    if cfg is None:
        cfg = CONFIG
    voice = voice or cfg["elevenlabs_voice"]
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}"
    payload = {"text": text, "model_id": "eleven_multilingual_v2",
               "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "xi-api-key": cfg["elevenlabs_key"],
                                          "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=60) as r:
        audio = r.read()
    return audio, "elevenlabs"


def nim_synthesize(text: str, cfg=None) -> tuple[bytes, str]:
    """NVIDIA NIM TTS (e.g. nvidia/parakeet or a hosted TTS NIM)."""
    if cfg is None:
        cfg = CONFIG
    url = "https://ai.api.nvidia.com/v1/audio/speech"
    payload = {"model": "nvidia/tts", "input": text, "voice": "en-US-JennyNeural"}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {cfg['nvidia_nim_key']}",
                                          "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), "nvidia_nim"
