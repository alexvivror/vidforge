# ---------- Per-request provider key overrides ----------
# The web app lets users enter API keys in a Settings panel (stored in
# localStorage). These are merged over the server-side env CONFIG per request,
# so the SAME deployed server serves different users with their own keys.

from backend.providers import CONFIG


def merge_keys(overrides):
    """Return an effective config: env CONFIG + any per-request overrides."""
    cfg = dict(CONFIG)
    if not overrides:
        return cfg
    for k, v in overrides.items():
        if isinstance(v, str) and v.strip():
            cfg[k] = v.strip()
    return cfg


# mapping from frontend field names to CONFIG keys
FIELD_MAP = {
    "opencodezen": "opencodezen_key",
    "opencodezenModel": "opencodezen_model",
    "elevenlabs": "elevenlabs_key",
    "elevenlabsVoice": "elevenlabs_voice",
    "nvidiaNim": "nvidia_nim_key",
    "unsplash": "unsplash_key",
    "pexels": "pexels_key",
    "pixabay": "pixabay_key",
    "firecrawl": "firecrawl_key",
    "freesound": "freesound_key",
    "wav2lip": "wav2lip_bin",
}


def effective_config(body):
    """Build effective config from an API request body's `keys` object."""
    overrides = {}
    if isinstance(body.get("keys"), dict):
        raw = body["keys"]
        for field, cfg_key in FIELD_MAP.items():
            if raw.get(field):
                overrides[cfg_key] = raw[field]
    return merge_keys(overrides)
