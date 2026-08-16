# Voice Import changes — v0.12.0

## Added

- `src/VoiceFamilyImport.jsx` — recording/upload/transcript/rough-tree/review/commit workflow.
- `src/familyInterpreter.js` — conservative English, Spanish, and Sindhi family-story interpreter.
- `voice_backend/server.py` — optional local FastAPI + Whisper speech-to-text service.
- `voice_backend/1 - INSTALL VOICE BACKEND.bat`
- `voice_backend/2 - START VOICE BACKEND.bat`
- `voice_backend/requirements.txt`
- `voice_backend/README.md`
- `supabase/migrations/20260816133000_add_voice_import_age_fields.sql`
- `RUN_THIS_IN_SUPABASE_FOR_VOICE_IMPORT.sql` — same migration copied to the project root for easy use.

## Updated

- `src/App.jsx`
  - Voice import navigation item and home CTA.
  - v0.12.0 release notes.
  - Confirmed-only voice import commit into existing `family_members` and `relationships` tables.
  - `age_as_reported` / `age_recorded_at` support.
- `src/styles.css` — complete Voice Import interface and responsive styling.
- `.env.example` — optional `VITE_VOICE_API_URL`.
- `.gitignore` — excludes the local Python virtual environment/cache.
- `README.md` — setup and voice import instructions.
- `package.json` / `package-lock.json` — version `0.12.0`.

## v0.12.2 — multi-relation interpretation fix

- Reworked `familyInterpreter.js` so an unpunctuated Whisper transcript is split at relationship cues instead of treating the whole recording as one person's name.
- Extracts multiple relatives from one continuous recording (for example: sister → mother → grandmother → uncle).
- Keeps trailing facts with the correct person: age, birth location, and current/last-known location.
- Treats first-person facts such as “I'm currently living in Russia” as narrator facts rather than attaching them to the previous relative.
- Supports nested English relationship chains such as “my mother's brother” and “my father's mother”.
- Supports Spanish direct relationships, “tengo un/una …”, and “el/la … de mi …” forms.
- Supports pronoun follow-ups such as “he's 54” / “she was born in …” for the most recently introduced person.
- Preserves uncertainty for plain “uncle”, “aunt”, “grandmother”, etc. when maternal/paternal side is not stated.
