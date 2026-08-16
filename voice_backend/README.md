# Vansh local voice backend

This optional local service converts uploaded/recorded audio into text for the **Voice import** page.

## Languages

- English: `openai/whisper-small`
- Spanish: `openai/whisper-small`
- Sindhi: `steja/whisper-small-sindhi`

You can override any model using `VANSH_STT_MODEL_EN`, `VANSH_STT_MODEL_ES`, or `VANSH_STT_MODEL_SD` before starting the server.

## Windows setup

1. Install Python 3.10 or 3.11 and make sure `python` works in Command Prompt.
2. Install FFmpeg and make sure `ffmpeg -version` works in Command Prompt. This is normally required for browser WebM microphone recordings.
3. Double-click **1 - INSTALL VOICE BACKEND.bat** once.
4. Double-click **2 - START VOICE BACKEND.bat** whenever you want model-based transcription.
5. Keep the backend window open and run the Vansh Vite app as normal.

The service runs at `http://127.0.0.1:8001`. You can check it at `http://127.0.0.1:8001/health`.

## API

`POST /transcribe` as multipart form data:

- `file`: audio file
- `language`: `en`, `es`, or `sd`

The response contains `text`, `language`, and `model`.

## Privacy

The included backend runs on the same computer as the Vansh frontend. Audio is written only to a temporary file for transcription and then deleted. The first model load downloads model files to the normal Hugging Face cache on the computer.
