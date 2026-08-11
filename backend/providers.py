"""Provider configuration for VidForge AI.

Every provider is OPTIONAL. With no API keys configured the app runs fully
on free fallbacks (browser TTS, generated SVG slides, trafilatura fetch).
With keys it upgrades to premium providers:

  LLM      : OPENCODEZEN_API_KEY  (OpenAI-compatible)  or POLLINATIONS
  TTS      : ELEVENLABS_API_KEY   or NVIDIA_NIM_API_KEY
  IMAGES   : PEXELS_API_KEY       or UNSPLASH_ACCESS_KEY  or PIXABAY_API_KEY
  AVATAR   : NVIDIA_NIM_API_KEY   (avatar endpoints) + WAV2LIP (local GPU)
  FETCH    : FIRECRAWL_API_KEY    (article extraction; fallback trafilatura)
"""
import os

CONFIG = {
    "opencodezen_key": os.getenv("OPENCODEZEN_API_KEY", ""),
    "opencodezen_base": os.getenv("OPENCODEZEN_BASE", "https://opencodezen.ai/api/v1"),
    "opencodezen_model": os.getenv("OPENCODEZEN_MODEL", "deepseek-v4-flash-free"),
    "pollinations_key": os.getenv("POLLINATIONS_API_KEY", ""),
    "elevenlabs_key": os.getenv("ELEVENLABS_API_KEY", ""),
    "elevenlabs_voice": os.getenv("ELEVENLABS_VOICE", "21m00Tcm4TlvDq8ikWAM"),
    "nvidia_nim_key": os.getenv("NVIDIA_NIM_API_KEY", ""),
    "pexels_key": os.getenv("PEXELS_API_KEY", ""),
    "unsplash_key": os.getenv("UNSPLASH_ACCESS_KEY", ""),
    "pixabay_key": os.getenv("PIXABAY_API_KEY", ""),
    "firecrawl_key": os.getenv("FIRECRAWL_API_KEY", ""),
    "wav2lip_bin": os.getenv("WAV2LIP_BIN", ""),
}


def provider_status() -> dict:
    return {
        "llm": "opencodezen" if CONFIG["opencodezen_key"] else ("pollinations" if CONFIG["pollinations_key"] else "builtin-extractive"),
        "tts": "elevenlabs" if CONFIG["elevenlabs_key"] else ("nvidia_nim" if CONFIG["nvidia_nim_key"] else "browser-speechSynthesis"),
        "images": "pexels" if CONFIG["pexels_key"] else ("unsplash" if CONFIG["unsplash_key"] else ("pixabay" if CONFIG["pixabay_key"] else "generated-svg")),
        "avatar": "nvidia_nim" if CONFIG["nvidia_nim_key"] else ("wav2lip" if CONFIG["wav2lip_bin"] else "css-avatar"),
        "fetch": "firecrawl" if CONFIG["firecrawl_key"] else "trafilatura",
    }
