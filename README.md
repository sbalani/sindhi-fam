# Vansh

Vansh is a React + Vite family-map application backed by Supabase.

## Run the web app locally

1. Copy your existing `.env.local` into this project root (or create it from `.env.example`).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Vite:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173`.

## Voice Family Import — v0.12.0

The new **Voice import** flow lets a user:

1. Choose English, Spanish, or Sindhi.
2. Choose which existing family member is speaking.
3. Record speech, upload audio, or type/paste a transcript.
4. Correct the transcript before interpretation.
5. Generate a **rough family tree** from the story.
6. See the evidence sentence and confidence for each interpreted person.
7. Review every person one-by-one and edit name, age, current/last location, and birth location.
8. Confirm or reject each mapping.
9. Save **only confirmed** people and direct graph relationships to the real family tree.

The interpretation layer is intentionally conservative. Missing facts remain missing, and a stated age is stored as the age reported on that date instead of being converted into a guessed birth year.

### One-time Supabase step

Open Supabase → **SQL Editor**, paste the contents of:

`RUN_THIS_IN_SUPABASE_FOR_VOICE_IMPORT.sql`

and click **Run** once.

This adds:

- `age_as_reported`
- `age_recorded_at`

to `public.family_members`.

The app includes a backward-compatible insert fallback if those columns have not been added yet, but running the migration is recommended so age survives reloads.

## Speech-to-text options

### A. Browser live transcription

When the browser exposes Web Speech Recognition, Vansh can place live recognized text into the transcript box while recording. Browser/language availability varies, so the transcript is always editable.

### B. Included local Whisper service

For model-based transcription — especially for Sindhi — use `voice_backend/`.

On Windows:

1. Install Python 3.10/3.11.
2. Install FFmpeg and ensure `ffmpeg -version` works in Command Prompt.
3. Double-click `voice_backend/1 - INSTALL VOICE BACKEND.bat` once.
4. Double-click `voice_backend/2 - START VOICE BACKEND.bat` whenever using voice transcription.
5. Leave that window open while Vansh runs.

The backend defaults to `http://127.0.0.1:8001`. If you use a different address, set:

```env
VITE_VOICE_API_URL=http://127.0.0.1:8001
```

The local service loads speech models lazily. The first transcription for a language may take longer while that model is downloaded.

## Interpretation safety model

Voice imports are kept as an in-memory draft until the review is completed. The application does **not** directly let speech recognition write to `family_members` or `relationships`.

Flow:

`audio → transcript → editable transcript → interpreted draft graph → per-person review → confirmed graph → Supabase`

The current interpreter handles common English, Spanish, and Sindhi/romanized-Sindhi kinship statements and converts derived relations into the existing direct graph primitives (`parent`, `sibling`, `spouse`, `partner`). The review flow is deliberately separated from the interpreter so the interpretation engine can later be upgraded without changing the confirmation/safety gate.
