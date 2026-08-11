#!/bin/bash
# VidForge AI — local run
cd /opt/data/vidforge
exec /opt/data/vidforge-venv/bin/python3 -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}
