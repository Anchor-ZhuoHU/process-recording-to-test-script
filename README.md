# process-recording-to-test-script

Turn a screen recording of a business process into a structured **test script**: an ordered
list of steps, each with an action, a description, an expected result, a timestamp, and a
screenshot of the screen at that moment.

## Why

Consultants at system integrators hand-write "test scripts" that document how to perform a
process (e.g. creating a purchase order). A 2-minute process can take 45 minutes to document
by hand. This app ingests the recording and uses the Gemini Video Understanding API to produce
the step list automatically, so the consultant edits instead of authoring from scratch.

## How it works

```
upload .mov/.mp4          Files API upload + poll ACTIVE        structured steps (JSON)
   (browser)         ->        (/api/process)             ->     (Gemini, one row per step)
                                                                          |
              table w/ screenshots   <-   ffmpeg extracts a frame   <-  MM:SS timestamp per step
```

1. User configures the columns they want (or uses the default template) and uploads a recording.
2. The backend uploads the video to the Gemini File API, then asks Gemini for an ordered list of
   steps as schema-constrained JSON, one field per configured column plus an `MM:SS` timestamp.
3. For each step, the backend seeks the video to that timestamp with ffmpeg and extracts a
   downscaled JPEG screenshot.
4. The frontend renders the steps as a table with inline screenshots.

## Stack

- **Next.js (App Router, TypeScript)** — frontend and API routes in one repo; the company's own
  recommendation and the shortest path to a running end-to-end slice.
- **`@google/genai`** — Gemini File API upload plus `generateContent` with a `responseSchema`
  for reliable structured output.
- **`ffmpeg-static`** — bundled ffmpeg binary spawned directly to extract frames; reviewers need
  no system ffmpeg install.
- **`zod`** — validates the column config and tolerantly parses Gemini's JSON so a bad template
  degrades a cell instead of crashing the run.
- **Tailwind CSS** — clean, professional table and form UI.

## Scope

- **MVP (Part 1):** upload a video, get a table of steps with Action / Description / Expected
  Result / Timestamp / Screenshot.
- **Signature (Part 2):** user-defined columns. One column config drives the Gemini prompt, a
  dynamically built response schema, and the table headers, built so a custom template cannot
  break generation.
- **Stretch:** unit tests on the schema/column logic, Markdown/CSV export, saved column
  templates, full-resolution screenshot download.

## Follow-ups (known gaps, deliberately deferred)

Scoped out of the prototype to keep the end-to-end flow correct within the time box. Each was
considered and consciously postponed, not overlooked (see `DECISIONS.md`).

- **Durable video storage.** The upload is kept only as an ephemeral server temp file for the
  duration of one request, then deleted. A real product would persist it to object storage
  (S3 / GCS), register the GCS URI with the Gemini File API instead of re-uploading, and
  re-process or serve it from there. The Gemini File API itself is not storage: it holds files
  for 48h and cannot return the bytes. (DECISIONS D8.)
- **Asynchronous processing.** Long videos run synchronously behind a loading state today; a
  production version would use a job queue plus status polling. (DECISIONS D5.)
- **Rate-limit resilience.** A Gemini `429` today surfaces as a failed request; production would
  retry with backoff and optionally fall back to a second API key.
- **Long-ID OCR misreads.** Gemini can occasionally misread long numeric IDs from the video
  (nondeterministic); the per-step screenshot lets a user verify and correct them, and editable
  result cells would make that a one-click fix. (DECISIONS D13.)
- Unit tests on the schema/column logic, Markdown/CSV export, saved column templates, and
  full-resolution screenshot download.

## Documentation

- `PLAN.md` — the step-by-step build plan and time boxes.
- `DECISIONS.md` — the running log of decisions and tradeoffs (the walkthrough spine).
- `resources/instruction.pdf`: the assignment brief this project is built from.
- `resources/instruction-google-api.md`: the empirically verified Gemini API reference (the
  learning output that `lib/gemini.ts` and `lib/schema.ts` were built against).
- `resources/` also holds the demo videos and vendor API docs, which stay local-only (gitignored).

## Quick start

_Filled in at wrap; see `PLAN.md` in the meantime._
