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
- **Beyond the brief (shipped):** inline-editable result cells (correct Gemini's draft in place,
  saved on blur) and CSV export (UTF-8 BOM so Excel keeps accented text).

## Roadmap and known gaps

Beyond Parts 1 and 2, two extras shipped: inline-editable result cells and CSV export. The next
things I would build, in priority order (deliberately deferred within the time box, not overlooked;
see `DECISIONS.md`):

**Export and hand-off**
- **PDF export** with the screenshots embedded (the real artifact a consultant hands over).
- **Markdown export** for wikis, Confluence, or GitHub.

**Reviewing against the recording**
- **Inline video preview** with click-a-step to seek the video to that step's timestamp.
- **Adjust-and-re-grab a screenshot** by nudging a step's timestamp when a frame lands slightly off.

**Editing the script**
- **Step-list refinement**: reorder, merge, split, or delete steps; Gemini's granularity is a start.
- **Saved column templates** per client (name and reload a template), matching the "different
  clients, different templates" premise.

**Generation quality**
- **Output-language control** (e.g. force English) at generation time, complementing manual edits
  for non-English (pt-BR) screens.
- **Low-confidence flags** on long numeric IDs (DECISIONS D13) so a reviewer knows which cells to
  double-check against the screenshot.

**Production hardening** (out of scope for a prototype)
- **Durable video storage** (S3 / GCS) instead of an ephemeral temp file. The Gemini File API is
  not storage: it holds files for 48h and cannot return the bytes. (DECISIONS D8.)
- **Asynchronous processing** with a job queue plus polling for long videos. (DECISIONS D5.)
- **Rate-limit resilience**: retry with backoff on `429`, plus a backup key.
- **Unit tests** on the pure logic (slugify, validateColumns, toCsv, buildResponseSchema, buildStepZod).

## Documentation

- `PLAN.md` — the step-by-step build plan and time boxes.
- `DECISIONS.md` — the running log of decisions and tradeoffs (the walkthrough spine).
- `resources/instruction.pdf`: the assignment brief this project is built from.
- `resources/instruction-google-api.md`: the empirically verified Gemini API reference (the
  learning output that `lib/gemini.ts` and `lib/schema.ts` were built against).
- `resources/` also holds the demo videos and vendor API docs, which stay local-only (gitignored).

## Quick start

```bash
npm install
cp .env.example .env.local   # then set GEMINI_API_KEY (get a key at aistudio.google.com/apikey)
npm run dev                  # http://localhost:3000
```

Optionally edit the columns, choose a screen recording under 3 minutes (samples live in
`resources/demo-videos/`), and click **Generate test script**. You get an editable table of steps
with a screenshot each; edit any cell in place, then **Export CSV**.
