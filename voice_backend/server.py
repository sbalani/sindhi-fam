"""Local speech-to-text service for Vansh voice family import.

Run with:
    python -m uvicorn server:app --host 127.0.0.1 --port 8001

Models are loaded lazily on the first request for each language.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Dict

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from transformers import pipeline

app = FastAPI(title="Vansh Voice Backend", version="0.1.0")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "VANSH_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

MODEL_BY_LANGUAGE = {
    "en": os.getenv("VANSH_STT_MODEL_EN", "openai/whisper-small"),
    "es": os.getenv("VANSH_STT_MODEL_ES", "openai/whisper-small"),
    "sd": os.getenv("VANSH_STT_MODEL_SD", "steja/whisper-small-sindhi"),
}

LANGUAGE_HINT = {
    "en": "english",
    "es": "spanish",
}

_pipelines: Dict[str, object] = {}


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _get_pipeline(language: str):
    if language in _pipelines:
        return _pipelines[language]

    model_name = MODEL_BY_LANGUAGE[language]
    use_cuda = torch.cuda.is_available()
    kwargs = {
        "task": "automatic-speech-recognition",
        "model": model_name,
        "device": 0 if use_cuda else -1,
    }
    if use_cuda:
        kwargs["torch_dtype"] = torch.float16

    try:
        recognizer = pipeline(**kwargs)
    except Exception as exc:  # pragma: no cover - depends on local model/download state
        raise HTTPException(
            status_code=503,
            detail=(
                f"Could not load speech model '{model_name}'. "
                "Check your internet connection for the first model download, then retry. "
                f"Technical detail: {exc}"
            ),
        ) from exc

    _pipelines[language] = recognizer
    return recognizer


@app.get("/health")
def health():
    return {
        "ok": True,
        "languages": list(MODEL_BY_LANGUAGE),
        "models": MODEL_BY_LANGUAGE,
        "ffmpeg": _ffmpeg_available(),
        "device": "cuda" if torch.cuda.is_available() else "cpu",
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("en")):
    language = (language or "en").lower().strip()
    if language not in MODEL_BY_LANGUAGE:
        raise HTTPException(status_code=400, detail="language must be en, es, or sd")

    suffix = Path(file.filename or "recording.webm").suffix.lower() or ".webm"
    if suffix not in {".wav", ".flac", ".mp3", ".m4a", ".mp4", ".ogg", ".webm", ".aac"}:
        suffix = ".audio"

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded audio file is empty.")
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio files are limited to 100 MB.")

    # Browser microphone recordings are commonly WebM/Opus. Transformers uses
    # ffmpeg for these formats, so give a specific setup error if it is absent.
    if suffix in {".webm", ".m4a", ".mp4", ".ogg", ".aac", ".mp3"} and not _ffmpeg_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "FFmpeg is required to decode this audio format. Install FFmpeg and make "
                "sure the ffmpeg command is available in Command Prompt, then restart the backend."
            ),
        )

    recognizer = _get_pipeline(language)

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        temp.write(data)
        temp_path = temp.name

    try:
        call_kwargs = {"chunk_length_s": 30, "batch_size": 4}
        if language in LANGUAGE_HINT:
            call_kwargs["generate_kwargs"] = {
                "language": LANGUAGE_HINT[language],
                "task": "transcribe",
            }
        result = recognizer(temp_path, **call_kwargs)
        text = (result.get("text") if isinstance(result, dict) else str(result)).strip()
        return {
            "text": text,
            "language": language,
            "model": MODEL_BY_LANGUAGE[language],
        }
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - model/audio dependent
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
