"""Avatar generation: NVIDIA NIM (photo/avatar models) + Wav2Lip (lip-sync).
Frontend falls back to a CSS animated presenter when neither is configured."""
from __future__ import annotations

import json
import urllib.request

from backend.providers import CONFIG


def avatar_provider() -> str:
    if CONFIG["nvidia_nim_key"]:
        return "nvidia_nim"
    if CONFIG["wav2lip_bin"]:
        return "wav2lip"
    return "css"


def nim_avatar(prompt: str, seed: int = 42) -> tuple[bytes, str]:
    """NVIDIA NIM image generation (e.g. sdxl / edify hosted NIMs). Endpoint
    and model are configurable per NIM deployment."""
    url = "https://ai.api.nvidia.com/v1/genai/nvidia/sdxl"
    payload = {"prompt": prompt, "seed": seed, "height": 1024, "width": 1024}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {CONFIG['nvidia_nim_key']}"})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read().decode())
    b64 = data.get("artifacts", [{}])[0].get("base64", "")
    import base64
    return base64.b64decode(b64), "nvidia_nim"


def wav2lip_command(audio_path: str, face_path: str, out_path: str) -> list[str]:
    """Wav2Lip CLI invocation template (runs on a GPU box with the repo cloned)."""
    bin_dir = CONFIG["wav2lip_bin"] or "wav2lip"
    return [
        "python", f"{bin_dir}/inference.py",
        "--checkpoint_path", f"{bin_dir}/checkpoints/wav2lip_gan.pth",
        "--face", face_path, "--audio", audio_path, "--outfile", out_path,
    ]
