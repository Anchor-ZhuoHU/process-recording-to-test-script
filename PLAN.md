# PLAN.md: Process Recording -> Test Script generator

Exhaustive build plan. Everything is decided here: interfaces, function signatures, the route
contract, component props, error shapes. The build phase is execution, not design. No real code
lives here, only the specification the code must satisfy.

## Time budget (live)

- Plan finalized ~16:40 EDT. Heads-down build starts right after. Hard demo window is the last
  30 min; freeze line ~15 min before the hard stop.
- Remaining build runway is short (~60-75 min), so time boxes below are aggressive. The walking
  skeleton (M1) plus real Gemini steps (M2) are the never-cut demo. Everything after degrades
  gracefully per the cut order.
- Cadence per step (hard rule): build -> self-test -> plain-language walkthrough to Anchor ->
  joint end-to-end test at the checkpoint -> hand Anchor a `/review-then-push` prompt for a
  parallel agent -> only then the next step. Never batch steps. Never one mega-commit.

## Goal

A webapp where a user uploads a screen recording of a business process (SAP / Oracle style ERP
flows), the backend uses the Gemini Video Understanding API to extract an ordered list of steps
(one row per step) with a timestamp and a screenshot per step, and the result renders as a table.
Users can define their own columns (client templates) without breaking generation (Part 2).

Input constraint (DECISIONS D9): the product accepts only recordings strictly under 3 minutes and
never analyzes audio; a longer upload is rejected up front. The 3 provided samples that fit this
(under 3 min, no audio) are the ones we build and test against.

## Scope tiers

- MVP / Part 1 (must run): upload a video -> table of steps with Action / Description / Expected
  Result / Timestamp / Screenshot.
- Signature / Part 2 (the depth point): user-defined columns. One column config drives the Gemini
  prompt, a dynamically built response schema, and the table headers, built so a custom template
  cannot break generation.
- Stretch: unit tests on schema/column logic, Markdown/CSV export, saved templates, full-res
  screenshot download.
- CUT (recorded as Follow-ups in README + DECISIONS D8): durable video persistence (S3 / GCS).
  Prototype keeps the upload only as an ephemeral temp file for the duration of one request.

## Stack

- Next.js 16 (App Router, TypeScript, `src/` dir): frontend + API route handlers in one repo.
  NOTE: this repo's Next is 16.x with breaking changes; route handler + segment config confirmed
  against `node_modules/next/dist/docs`. `context.params` is a Promise (not used here, no dynamic
  segments), `request.formData()` is standard, segment config `runtime` / `maxDuration` valid.
- `@google/genai` 2.10: `ai.files.upload` + `ai.models.generateContent` with `responseSchema`.
- `ffmpeg-static`: bundled ffmpeg binary, spawned directly for frame extraction. No system install.
- `zod` 4: validate the incoming column config and tolerantly parse Gemini JSON.
- Tailwind CSS 4: table + form UI (ships with the scaffold).

## Architecture and data flow

```
browser (page.tsx, client)
  columns config (label + description)  +  chosen video file
        |  multipart POST  (video, columns JSON)
        v
/api/process (route.ts, nodejs runtime)
  1. parse formData, validate columns            -> 400 on bad input
  2. write upload to os.tmpdir temp file
  3. gemini.uploadVideo(tempPath, mime)          -> File API, poll until ACTIVE
  4. gemini.extractSteps({fileUri, mime, cols})  -> generateContent + responseSchema -> Step[]
  5. for each step: frames.extractFrame(tempPath, sec) -> JPEG -> data URI (M3)
  6. finally: delete temp file
        |  200 ProcessResult JSON
        v
browser renders StepsTable (headers = columns + Timestamp + Screenshot)
```

## File tree (final)

```
src/
  app/
    page.tsx                  # client page: column config + upload + run + results
    layout.tsx                # (edit metadata title/description only)
    globals.css               # (unchanged)
    api/process/route.ts      # POST handler, the whole backend pipeline
  components/
    ColumnConfig.tsx          # add/edit/remove/reset user columns (M4)
    UploadForm.tsx            # file picker, run button, loading + error state (M1)
    StepsTable.tsx            # renders columns + timestamp + screenshot (M1)
    Screenshot.tsx            # thumbnail, click to zoom modal (M3)
  lib/
    types.ts                  # ColumnDef, Step, ProcessResult, ProcessError
    columns.ts                # DEFAULT_COLUMNS, slugify, validateColumns
    schema.ts                 # buildResponseSchema, buildStepZod, buildColumnInstructions
    prompt.ts                 # SYSTEM_INSTRUCTION, buildTaskPrompt
    gemini.ts                 # getClient, uploadVideo, extractSteps, MODEL constants
    frames.ts                 # extractFrame, toDataUri, probeDurationSeconds
scripts/
  spike.mjs                   # throwaway M2 spike (not shipped, gitignored or deleted)
```

## Data model: `lib/types.ts`

```ts
interface ColumnDef {
  key: string;          // unique slug used as the JSON/object key, e.g. "action"
  label: string;        // display header, e.g. "Action"
  description: string;  // guidance handed to Gemini for what to put in this column
}

interface Step {
  values: Record<string, string>;  // keyed by ColumnDef.key; one entry per configured column
  timestamp: string;               // "MM:SS" as returned by Gemini
  timestampSeconds: number;        // parsed whole seconds, for ffmpeg seek
  screenshot: string | null;       // data URI (base64 JPEG); null until M3 fills it
}

interface ProcessResult {
  steps: Step[];
  columns: ColumnDef[];   // the columns actually used (echoed back so the table self-describes)
  videoName: string;
  model: string;          // which model produced it (nice to show in the demo)
}

interface ProcessError { error: string; }
```

Rationale: system columns (timestamp, screenshot) are NOT `ColumnDef`s and are kept out of
`values` so a user column can never collide with them.

## Module specs (signatures + behavior, no code)

### `lib/columns.ts`
- `DEFAULT_COLUMNS: ColumnDef[]` = three entries:
  - `action` / "Action" / "High-level action taken, e.g. 'Create purchase requisition'."
  - `description` / "Description" / "What the user did in detail: fields filled, buttons clicked, values entered."
  - `expectedResult` / "Expected Result" / "The expected system state or response after this step."
- `slugify(label: string): string` -> lowercase, split on non-alphanumeric, camelCase-join; if the
  result is empty (label was all punctuation) return `"column"`. Pure, no side effects.
- `validateColumns(input: unknown): { ok: true; columns: ColumnDef[] } | { ok: false; errors: string[] }`
  - Parse with a zod array schema of `{ label: string; description?: string }`.
  - Reject if not an array or length 0 -> error "at least one column is required".
  - Trim labels; drop entries with an empty label.
  - Derive `key = slugify(label)`; on collision append `-2`, `-3`, ... to keep keys unique.
  - Soft cap at 12: if more, keep the first 12 and push a non-fatal note (still `ok: true`).
  - Return the normalized `ColumnDef[]`.
- Used by both the route (validating the incoming payload) and, as `DEFAULT_COLUMNS`, the frontend
  initial state.

### `lib/schema.ts` (Gemini structured output + tolerant parse)
- `buildResponseSchema(columns: ColumnDef[]): Schema` (Gemini `Schema`, `Type` from `@google/genai`)
  - `Type.OBJECT` with one property `steps: Type.ARRAY`, items = a step object:
    - `Type.OBJECT`, one `Type.STRING` property per `column.key`, plus `timestamp: Type.STRING`.
    - Set `propertyOrdering` = column keys then `timestamp`; mark all `required`.
- `buildStepZod(columns: ColumnDef[]): ZodType<RawStep>` (tolerant)
  - object where each `column.key` is `z.string().optional().default("")` and
    `timestamp: z.string().optional().default("00:00")`, with `.passthrough()` so unexpected keys
    are ignored. Missing field -> "", never throws.
- `buildColumnInstructions(columns: ColumnDef[]): string`
  - a bullet list, one line per column: `- <label> (key: <key>): <description>`.
- These three are the single source of truth that makes Part 2 not break generation: the same
  `columns` array shapes the prompt, the response schema, and the parser.

### `lib/prompt.ts`
- `SYSTEM_INSTRUCTION: string` (constant): "You are a business-process analyst. You are given a
  screen recording of someone performing a process in an ERP system (SAP, Oracle, etc.). Produce a
  consultant-grade test script: an ordered list of discrete, meaningful steps. Read on-screen field
  values, labels, and button text accurately. Do not invent steps. Merge trivial UI micro-actions
  into one meaningful step. The recording is silent; rely only on what is visible on screen."
- `buildTaskPrompt(columns: ColumnDef[]): string` -> instruction body that:
  - states the columns to fill via `buildColumnInstructions(columns)`,
  - defines `timestamp` as "MM:SS of the clearest frame that represents this step" and notes the
    video is sampled at ~1 FPS so second-granularity is expected,
  - demands JSON only, matching the provided schema, no prose.

### `lib/gemini.ts`
- `MODEL_PRIMARY = "gemini-flash-latest"` (or `"gemini-3.5-flash"` per the provided docs);
  `MODEL_FALLBACK = "gemini-2.5-flash"`. The M2 spike picks the one that actually resolves and is
  recorded in DECISIONS D4.
- `getClient(): GoogleGenAI` -> `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })`; throw a
  clear error if the key is missing.
- `uploadVideo(path: string, mimeType: string): Promise<{ fileUri: string; mimeType: string }>`
  - `ai.files.upload({ file: path, config: { mimeType } })`, then poll `ai.files.get({ name })`
    every ~2s until `state === FileState.ACTIVE`; throw on `FAILED`; time out after ~60s.
  - returns `{ fileUri: file.uri, mimeType: file.mimeType }`.
- `extractSteps(args: { fileUri: string; mimeType: string; columns: ColumnDef[] }): Promise<{ steps: Step[]; model: string }>`
  - `ai.models.generateContent({ model, config: { systemInstruction, responseMimeType: "application/json", responseSchema: buildResponseSchema(cols) }, contents: [ createPartFromUri(fileUri, mimeType), { text: buildTaskPrompt(cols) } ] })`.
  - Parse `response.text` as JSON, validate `steps` with `z.array(buildStepZod(cols))`.
  - Map each raw step -> `Step`: pull `column.key` values into `values`, `timestamp` string,
    `timestampSeconds = parseMmSs(timestamp)`, `screenshot: null`.
  - Wrap the primary model in a try/catch: on a model-not-found error retry once with
    `MODEL_FALLBACK`. Return `{ steps, model }`.
- `parseMmSs(ts: string): number` helper (also usable by the route) -> minutes*60 + seconds;
  tolerate "M:SS", "MM:SS", or a bare integer; clamp to >= 0.

### `lib/frames.ts`
- `extractFrame(videoPath: string, seconds: number): Promise<Buffer>`
  - spawn `ffmpeg-static` binary with args:
    `-ss <seconds> -i <videoPath> -frames:v 1 -vf scale=1280:-1 -q:v 3 -f mjpeg pipe:1`,
    collect stdout chunks into a Buffer, reject on non-zero exit or empty output.
- `toDataUri(buf: Buffer): string` -> `data:image/jpeg;base64,<...>`.
- `probeDurationSeconds(videoPath: string): Promise<number | null>` (best effort)
  - run ffmpeg with `-i <path>` and parse the `Duration: HH:MM:SS.xx` line from stderr; return
    seconds or `null` if unparseable. Used only to clamp seek targets; failure is non-fatal.

### `app/api/process/route.ts` (the backend pipeline)
- Segment config: `export const runtime = "nodejs";` `export const maxDuration = 300;`
- `POST(request: Request): Promise<Response>`:
  1. `const form = await request.formData()`.
  2. `const video = form.get("video")`: must be a `File` and non-empty, else `400 { error }`.
  3. `const columnsRaw = form.get("columns")`: if present JSON.parse; run `validateColumns`;
     on `ok: false` return `400 { error: errors.join("; ") }`; if absent use `DEFAULT_COLUMNS`.
  4. Write `video` bytes to a temp file `path.join(os.tmpdir(), \`${randomUUID()}-${video.name}\`)`,
     then `probeDurationSeconds(tempPath)`; if it exceeds 180s return `400 { error: "video must be
     under 3 minutes" }` (DECISIONS D9) and keep the duration for the M3 seek clamp.
  5. `const { fileUri, mimeType } = await uploadVideo(tempPath, video.type || inferMime(name))`.
  6. `const { steps, model } = await extractSteps({ fileUri, mimeType, columns })`.
  7. (M3) `const duration = await probeDurationSeconds(tempPath)`; for each step
     `extractFrame(tempPath, clamp(step.timestampSeconds, 0, duration))` -> `toDataUri` ->
     `step.screenshot`. Frame failures set `screenshot: null`, never throw the whole request.
  8. Return `200 Response.json({ steps, columns, videoName: video.name, model })`.
  9. Wrap 4-8 in try/catch -> `500 { error: message }`; `finally { unlink(tempPath).catch(noop) }`.

### API contract: `POST /api/process`
- Request: `multipart/form-data`
  - `video`: File (required). `.mov` / `.mp4`.
  - `columns`: string (optional). JSON of `{ label: string; description?: string }[]`. Absent -> defaults.
- Responses:
  - `200`: `ProcessResult` (`steps`, `columns`, `videoName`, `model`).
  - `400`: `ProcessError` (missing/empty video, or invalid column config).
  - `500`: `ProcessError` (upload / generation / server failure).

### Frontend components
- `app/page.tsx` (`"use client"`): owns state
  - `columns: { label: string; description: string }[]` (init `DEFAULT_COLUMNS` shape),
  - `result: ProcessResult | null`, `loading: boolean`, `error: string | null`.
  - Layout: title + one-line pitch, `<ColumnConfig>` (M4), `<UploadForm>`, then `<StepsTable>`.
- `components/UploadForm.tsx`: props `{ columns; onResult; onError; onLoading }`.
  - a file `<input type="file" accept="video/*">` + a "Generate test script" button.
  - on submit: build `FormData` with `video` and `columns` = `JSON.stringify(columns)`,
    `fetch("/api/process", { method: "POST", body })`, set loading, dispatch result or error.
- `components/StepsTable.tsx`: props `{ result: ProcessResult }`.
  - header row: one `<th>` per `result.columns[].label`, then "Timestamp", then "Screenshot".
  - body: one row per step; cells read `step.values[col.key]` (missing -> em-dash-free blank),
    `step.timestamp`, and `<Screenshot src={step.screenshot} />`.
- `components/Screenshot.tsx` (M3): props `{ src: string | null }`.
  - `null` -> a muted "no frame" placeholder; else a thumbnail `<img>` that opens a click-to-zoom
    modal (full data URI).
- `components/ColumnConfig.tsx` (M4): props `{ columns; onChange }`.
  - list of rows (label input + description input + remove button), an "Add column" button, and a
    "Reset to default" button. Its state is the source of truth passed down into the POST.

## Milestones

Each milestone ends with the cadence: self-test, walkthrough, joint checkpoint test, then a
`/review-then-push` handoff prompt. Boxes are aggressive on purpose.

### M1: Walking skeleton (15 min, MVP) - no Gemini yet
- Files: `lib/types.ts`, `lib/columns.ts` (defaults + slugify + validateColumns), `api/process/route.ts`
  (steps 1-3 only, then return a hardcoded 2-step stub whose `values` match the requested columns,
  `timestamp` "00:03"/"00:10", `screenshot: null`), `page.tsx` + `UploadForm.tsx` + `StepsTable.tsx`.
- Verify (joint): `npm run dev` (background task + `curl --retry-connrefused` to confirm boot);
  upload any file in the browser -> a 2-row table renders end to end. This is the demo spine.

### M2: Gemini integration (25 min, MVP) - the core value
- Prereq (done in parallel, not inline): a separate session empirically probes the live API against
  the 3 compliant samples (D9, D10) and writes a narrowed reference at
  `resources/instruction-google-api.md`: confirmed model name, the
  generateContent-vs-Interactions verdict, the exact File API flow, and the real output / timestamp
  shape. Read that file first and update DECISIONS D4 from it before wiring.
- Files: `lib/prompt.ts`, `lib/schema.ts`, `lib/gemini.ts`; wire route steps 5-6 (replace the stub).
- Verify (joint): upload the small sample -> real steps with sensible Action/Description/Expected
  and MM:SS timestamps render (screenshot cells still "no frame").

### M3: Screenshots (15 min, completes Part 1)
- Files: `lib/frames.ts`, `components/Screenshot.tsx`; wire route step 7 + temp cleanup in finally.
- Verify (joint): full run on the small sample -> table with real screenshots at each timestamp;
  click a thumbnail -> zoom modal. Part 1 done.

### M4: Flexible columns (15 min, SIGNATURE / Part 2)
- Files: `components/ColumnConfig.tsx`; page wires columns state into the POST; route already
  threads `columns` through validate -> prompt -> schema -> table.
- Robustness (the graded bit): unique slug keys, missing Gemini fields render blank, extra fields
  ignored, >= 1 column enforced, soft cap. A bad template degrades a cell, never crashes the run.
- Verify (joint): add a column ("Module" / "Which ERP module or screen this step happens in"),
  rerun -> new column populated, screenshots still correct. Remove a default, rerun -> still works.

## Cut order (when time runs out, last-in-first-out)
1. Stretch items (all).
2. M4 polish (keep the core add/remove-column path; drop reset/soft-cap niceties). Part 2 is an
   explicit ask, so keep at least add/remove even under pressure.
3. M3 screenshots degrade to timestamp-only (show "seek to MM:SS"), or a client-side canvas grab.
- Never cut: M1 + M2 (upload -> real steps table). That is the demo.

## Risks and mitigations
- Interactions API vs generateContent for structured output -> M2 spike resolves it before wiring.
- Model name may not resolve -> primary then `gemini-2.5-flash` fallback in `extractSteps`.
- 76MB `.mov` sample through a route handler -> nodejs runtime + `request.formData()`; iterate on
  the 3MB sample, test the big one only if time allows.
- ffmpeg-static has no ffprobe -> `probeDurationSeconds` parses ffmpeg stderr, clamp is best-effort,
  frame failure is non-fatal.
- Gemini timestamp off by ~1s -> acceptable at 1 FPS; clamp to [0, duration).
- Rate limits -> a second key is available; the spike keeps calls minimal.
```
