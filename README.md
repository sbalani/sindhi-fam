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

## Voice Family Import — v0.12.2

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

The interpretation layer separates continuous, often unpunctuated speech into relationship clauses, can extract multiple relatives from one recording, follows nested relations such as “my mother’s brother”, and keeps age/location facts attached to the person they describe. It remains conservative: missing facts remain missing, and a stated age is stored as the age reported on that date instead of being converted into a guessed birth year.

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

## v0.13 maps + relationship qualifiers

Before using v0.13, run `RUN_THIS_IN_SUPABASE_FOR_V013.sql` in Supabase SQL Editor.

New pages:
- **Places** — private map of locations belonging to people in your family tree.
- **Sindhis worldwide** — anonymous aggregated city/country counts across structured Vansh location records.

The local voice backend also provides place search. Start `voice_backend/2 - START VOICE BACKEND.bat` while testing location matching locally. The project also includes a deployable Supabase Edge Function under `supabase/functions/search-places`.

## v0.14 mutual identity verification

Before using v0.14, run `RUN_THIS_IN_SUPABASE_FOR_V014.sql` in Supabase SQL Editor after the earlier core/v0.13 migrations.

v0.14 adds a privacy-gated identity and connection layer:

- Every family-member record receives a random `person_identity_id`. The visible `VNSH-...` code is only a random reference; it does **not** encode the person's name, birth date, location, email, or family tree.
- Sign-up now asks for first name, surname, date of birth, birth place, and current location. Same-surname discovery is an explicit opt-in and is off by default.
- **Could this be you?** suggestions require a strong match on the signed-in user's own profile data. The claimant must explicitly request verification and the family-tree owner must explicitly approve it.
- The check also works in the opposite direction: after you add or correct a family member with sufficiently strong matching data, Vansh can ask **“Could this person already be on Vansh?”**. Sending that request still does nothing until the registered person accepts it.
- Approved identity matches are stored as a verified link between two records and the family record is visibly marked as a verified Vansh identity for its owner. Vansh does not silently merge or delete either family tree. The anonymous worldwide map uses these verified links to avoid counting the same confirmed person multiple times across different trees.
- **Same-surname discovery** only shows registered users who opted in. It exposes name, birth year, and broad location only; never email, full birth date, or tree contents.
- A same-surname request is not a family-tree relationship. Both users can confirm that they may be connected, but the exact parent/sibling/cousin/etc. relationship still has to be recorded separately when known.
- Incoming requests appear in the bell drawer and the **Connections** page.
- Voice-import relationships are now editable during review. A user can correct Sister → Half-sister, Brother → Maternal uncle, select **Not sure / choose relation**, and change other supported relations before confirming the draft.

For existing accounts, open **Connections → Your matching profile** and add/update your date of birth and location data before testing identity matching.
