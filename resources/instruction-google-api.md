# Gemini Video → Test-Script: confirmed API behavior + how-to

> **Status:** every claim below was verified by REAL calls against the live Gemini API on
> **2026-07-08**, using `@google/genai@2.10.0` (Node 24, `node --env-file=.env.local`) and the
> `GEMINI_API_KEY` in `.env.local`. This is not copied from docs; where the docs disagreed with
> reality, reality wins and the difference is flagged. Spike scripts live in `scripts/spike-*.mjs`.
>
> **TL;DR** — Model: **`gemini-3.5-flash`** (resolves; `gemini-2.5-flash` is a proven fallback).
> API: **`models.generateContent` + `responseMimeType:"application/json"` + `responseSchema`**
> (NOT the Interactions API). Timestamps come back as zero-padded **`MM:SS`** strings and are true
> elapsed video-time, second-accurate — `ffmpeg -ss MM:SS` lands exactly on the step.

---

## Part A — Confirmed behavior & decisions

### Test corpus (which videos are in-scope)

Probed all 5 sample videos with `ffmpeg -i`. Product rule = **strictly < 3:00 AND no audio stream**.
Exactly **3** qualify (as expected):

| Video | Duration | Audio stream | In-scope? |
|---|---|---|---|
| `PO to GR Flow example compressed.mp4` | 1:47.76 | none | ✅ used |
| `J45 PR.mov` | 2:25.06 | none | ✅ used (76 MB, `video/quicktime`) |
| `J45 PR -_ PO -_ SI.mp4` | 2:43.55 | none | ✅ used |
| `Oracle FusionCloud PR to PO.mp4` | 3:33.48 | aac stereo | ❌ over 3 min **and** has audio |
| `oracle pr to po.mp4` | 5:25.94 | opus stereo | ❌ over 3 min **and** has audio |

All three in-scope videos ran the full pipeline cleanly. (`ffmpeg-static` ships only `ffmpeg`, no
`ffprobe`; probe with `ffmpeg -i <file>` and read the `Duration` / `Stream ... Audio` lines from stderr.)

### Q1 — Which model names actually resolve?

`ai.models.list()` returned 54 models. **All three candidates resolve and generate:**

| Model name passed | `models.list` has it? | Tiny `generateContent`? |
|---|---|---|
| `gemini-flash-latest` | ✅ `models/gemini-flash-latest` | ✅ resolves |
| `gemini-3.5-flash` | ✅ `models/gemini-3.5-flash` | ✅ resolves |
| `gemini-2.5-flash` | ✅ `models/gemini-2.5-flash` | ✅ resolves |

**Decision: use `gemini-3.5-flash`** (matches the company's reference doc, latest flash, best video quality).
`gemini-2.5-flash` is a confirmed drop-in fallback if `3.5` is ever pulled. `gemini-flash-latest` is a
moving alias — fine for experiments, avoid pinning a product to it.

> Gotcha found here: a `generateContent` with `maxOutputTokens: 10` returned **empty** `text`. These
> are thinking models; a tiny output budget is consumed by reasoning tokens before any visible text.
> Not a problem for the real task (we use a generous budget) but don't set `maxOutputTokens` small.

### Q2 — generateContent + responseSchema vs Interactions API → **use generateContent**

**Decision (paste-ready for DECISIONS D4):** the app uses
**`ai.models.generateContent` with `config.responseMimeType = "application/json"` and
`config.responseSchema`** (built from the SDK's `Type` enum). This returned **schema-valid JSON on the
first try for all 3 videos**, `JSON.parse` succeeded every time, `finishReason` was `STOP` (no
truncation), and column order was locked via `propertyOrdering`. Evidence:

| Video | steps | `JSON.parse` | finishReason |
|---|---|---|---|
| PO to GR (1:47) | 18 | OK | STOP |
| J45 PR → PO → SI (2:43) | 18 | OK | STOP |
| J45 PR.mov (2:25) | 19 | OK | STOP |

**Why not the Interactions API** (`ai.interactions.create`, which does exist in this SDK via
`ai.interactions`): it works for free-text, but its structured-output story is second-class for us:
- Passing the standard `response_format: { type: "json_schema", json_schema: {...} }` was **rejected**:
  `400 The value 'json_schema' is not supported for 'type' at 'response_format'. Supported values:
  'string','image','text','number','integer','video','object','audio','array','boolean'`.
- A raw `response_format: { type:"array", items:{ type:"object", properties:{...} } }` *did* return
  valid JSON, but it is **loosely typed** in the SDK (`{[k:string]:any}` — no `Type` enum, no
  `required`, no `propertyOrdering`), ignored field ordering, and produced **coarser** output (10 steps
  vs 18 for the same video). It is under-documented and easy to get subtly wrong.

`generateContent` + `responseSchema` is the well-typed, well-documented, reproducible path and is what
the app should build on. Interactions offers no advantage for our fixed-columns extraction.

### Q3 — File API flow (real signatures & timing)

```
ai.files.upload({ file: string|Blob, config: { mimeType, displayName?, name? } })  ->  File
ai.files.get({ name })  ->  File           // poll this
```

`File` (returned) fields we rely on: **`name`** (`files/xxxx`, used for polling), **`uri`**
(`https://.../v1beta/files/xxxx`, used in the content part), **`mimeType`**, **`state`** (`FileState`
enum), plus `sizeBytes`, `expirationTime` (~48 h TTL), and `error` (a `FileStatus` on failure).

**`FileState` enum** (import from `@google/genai`): `STATE_UNSPECIFIED`, `PROCESSING`, `ACTIVE`, `FAILED`.
Right after upload `state` is `PROCESSING`; poll `files.get` until it leaves `PROCESSING`. Real timing
(upload + processing, polling every 2 s):

| Video | Size | Upload→ACTIVE | polls |
|---|---|---|---|
| PO to GR .mp4 | 3.1 MB | 5.7 s | 2 |
| J45 …SI .mp4 | 7.3 MB | 7.7 s | 3 |
| J45 PR **.mov** | 76 MB | 30.4 s | 11 |

So for our < 3 min clips, plan for **~5–30 s** to reach `ACTIVE` (dominated by upload of large `.mov`).
The 76 MB QuickTime `.mov` uploaded with `mimeType:"video/quicktime"` and processed fine — no
transcode needed. **Failure shape:** on a genuinely bad file `state` becomes `FAILED` and `file.error`
carries `{ code, message }` — check `state === FileState.FAILED` and throw. (A bad/expired file *name*
passed to `files.get` instead throws an `ApiError` 403 `PERMISSION_DENIED`, see Q6.)

### Q4 — Feeding the uploaded video into generateContent

Use the SDK helpers. Build the video part from the uploaded file's `uri` + `mimeType`, put the **text
prompt AFTER the video part**, and pass the instruction via `config.systemInstruction`:

```ts
contents: createUserContent([
  createPartFromUri(file.uri, file.mimeType),  // -> { fileData: { fileUri, mimeType } }
  promptText,                                  // text after the video (doc best practice)
]),
config: { systemInstruction, responseMimeType: "application/json", responseSchema },
```

`createPartFromUri(uri, mimeType)` produces a `{ fileData: { fileUri, mimeType } }` part. `systemInstruction`
is a top-level `config` field (a string is accepted). One video per request is the recommended best practice.

### Q5 — Real output + timestamp format (verified against pixels)

Timestamps come back as **zero-padded `MM:SS` strings** (`"00:02"`, `"00:44"`, `"01:35"`, `"02:30"`).
They are **true elapsed video-time, accurate to the second.** Verified end-to-end: the model labeled
`00:44 → "Enter '21' in Order Quantity, '10.00' in Net Order Price"`; running
`ffmpeg -ss 00:00:44 -i video -frames:v 1` produced a frame showing exactly the SAP Purchase-Order
Items row with the **Order Quantity** field focused ("Enter a quantity" validation) and Net Order Price
0.00 — the precise instant that step begins.

➡️ **For the app:** parse `"MM:SS"` → `minutes*60 + seconds` and feed that integer straight to
`ffmpeg -ss`. No offset, no sub-second guessing. Rounding to the whole second is correct by design
(Gemini samples video at 1 FPS and stamps every second), not a hack.

**Quality / granularity** was genuinely good: ~1 step per meaningful UI action (18–19 steps for a
~2-min clip), and it read exact on-screen values — currency `USD`, supplier `Carbon Tec Inc.
(17300002)`, material `TG11`, quantity `21`, price `10.00` → computed `210.00`, and generated document
numbers like PO `4500055191`, Material Document `5000055610`, Accounting Document `500007271`,
`Supplier invoice 51056017270026 has been created`. `action` / `description` / `expectedResult` map
cleanly onto the target columns. Full 18-step sample JSON: `scripts/` output / see below.

### Q6 — Gotchas

- **mediaResolution.** Default (unset) for `gemini-3.5-flash` on File-API video is the *low* tier:
  measured **~66 tokens/sec of video** (prompt 7 296 tok for a 107 s clip). Forcing
  `MediaResolution.MEDIA_RESOLUTION_HIGH` jumped the same clip to **28 537 tok (~258 tokens/sec, ~3.9×)**
  with **no quality win for us** (still 19 steps; default already read every field value correctly).
  **Recommendation: leave `mediaResolution` unset (default).** Only set `MEDIA_RESOLUTION_HIGH` if a
  specific video has unreadably small text. Enum values: `MEDIA_RESOLUTION_LOW` (~64/frame),
  `MEDIA_RESOLUTION_MEDIUM` (~256), `MEDIA_RESOLUTION_HIGH` (~256, zoomed reframing).
- **Token / size budget is a non-issue.** A < 3 min clip at default resolution costs ~7k–11k prompt
  tokens + ~1.5k output + ~1.2–1.7k thinking ≈ **10k–14k total tokens**. The 76 MB `.mov` was no problem
  (File API max is 2 GB free / 20 GB paid). Set `maxOutputTokens` generously (we used 16384); watch
  `finishReason` — if it is `MAX_TOKENS` the JSON can be truncated and `JSON.parse` will throw, so bump
  the budget and/or catch the parse error.
- **No audio = zero impact.** All 3 in-scope videos have no audio stream and processed perfectly; the
  ~66 tok/sec we measured is frames only (no +32 tok/sec audio component). Nothing special to do.
- **Rate limits.** ~15 real calls in this spike did **not** trip any limit on the primary key (I did not
  need the backup key). I therefore did not observe a live 429, but by the SDK's error contract a
  throttle surfaces as the same `ApiError` with `status === 429` (`RESOURCE_EXHAUSTED`) — handle it like
  the errors below (retry/backoff, or fall back to the second key).
- **Error shape.** Errors are **thrown** (not status fields on a success object). The thrown object is an
  **`ApiError`** with a numeric **`.status`** and a **`.message`** that is itself a JSON string
  `{"error":{"code","message","status"}}`. Observed:
  - Bad model name → `ApiError` **404** `NOT_FOUND` (`... is not found for API version v1beta ...`).
  - Bad/expired file name in `files.get` → `ApiError` **403** `PERMISSION_DENIED`
    (`You do not have permission to access the File ... or it may not exist`).
  So the app should `try/catch` around `upload`/`get`/`generateContent`, and separately check
  `file.state === FileState.FAILED` (that path sets `file.error`, it does **not** throw).

---

## Part B — Distilled how-to (TypeScript)

Minimal, project-specific reference. `app` author writes `lib/schema.ts` and `lib/gemini.ts` from this.
Everything here is confirmed against `@google/genai@2.10.0`.

### `lib/schema.ts` — the response schema (our exact columns)

```ts
import { Type, type Schema } from "@google/genai";

// One row of the test-script table. Order is locked with propertyOrdering.
export const STEP_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      timestamp: {
        type: Type.STRING,
        description: "Time this step occurs in the video, format MM:SS (e.g. 01:15).",
      },
      action: {
        type: Type.STRING,
        description: "Short high-level action for this step.",
      },
      description: {
        type: Type.STRING,
        description: "Exactly which fields were filled, buttons clicked, and values entered.",
      },
      expectedResult: {
        type: Type.STRING,
        description: "The system's expected state or response after this step.",
      },
    },
    required: ["timestamp", "action", "description", "expectedResult"],
    propertyOrdering: ["timestamp", "action", "description", "expectedResult"],
  },
};

export interface TestStep {
  timestamp: string;      // "MM:SS"
  action: string;
  description: string;
  expectedResult: string;
}

// "MM:SS" -> whole seconds, for `ffmpeg -ss`. Gemini stamps at 1 FPS, so integer seconds is exact.
export function timestampToSeconds(ts: string): number {
  const [mm, ss] = ts.split(":").map(Number);
  return mm * 60 + ss;
}
```

### `lib/gemini.ts` — upload → poll ACTIVE → generate → parse

```ts
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
  FileState,
} from "@google/genai";
import { STEP_SCHEMA, type TestStep } from "./schema";

export const MODEL = "gemini-3.5-flash"; // fallback: "gemini-2.5-flash"

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are a QA automation engineer. You are given a SILENT screen recording of a user performing a business process in an ERP web application (e.g. Oracle Fusion Cloud, SAP). Convert it into a step-by-step manual test script. Each step is one discrete user action (navigate, open a screen, fill a specific field, click a specific button, save/submit). Be precise: capture exact field names and the exact values typed. The video has NO audio; rely only on what is visible on screen. Follow the provided JSON schema exactly.`;

const PROMPT = `Extract the complete test script for the process shown in this video. Return a JSON array; each element is one chronological step with: action, description, expectedResult, and timestamp in MM:SS format matching when the step occurs in the video.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Upload a local video and block until the File API finishes processing it. */
async function uploadAndWaitActive(filePath: string, mimeType: string) {
  const uploaded = await ai.files.upload({ file: filePath, config: { mimeType } });

  let file = uploaded;
  while (file.state === FileState.PROCESSING) {
    await sleep(2000);
    file = await ai.files.get({ name: uploaded.name! });
  }

  if (file.state === FileState.FAILED) {
    throw new Error(`Gemini file processing failed: ${JSON.stringify(file.error)}`);
  }
  return file; // has .uri and .mimeType
}

/** Full pipeline: local video -> array of test-script steps. */
export async function videoToTestScript(
  filePath: string,
  mimeType: string, // "video/mp4" | "video/quicktime" | ...
): Promise<TestStep[]> {
  const file = await uploadAndWaitActive(filePath, mimeType);

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: createUserContent([
      createPartFromUri(file.uri!, file.mimeType!), // video part first
      PROMPT,                                       // text prompt AFTER the video
    ]),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: STEP_SCHEMA,
      maxOutputTokens: 16384,
      // mediaResolution: leave unset (default) — it already reads fine SaaS-form text.
    },
  });

  // Guard against a truncated response before parsing.
  const finish = response.candidates?.[0]?.finishReason;
  if (finish && finish !== "STOP") {
    throw new Error(`Gemini did not finish cleanly (finishReason=${finish}).`);
  }

  return JSON.parse(response.text ?? "[]") as TestStep[];
  // response.text is the raw JSON string; with responseMimeType it parses directly.
}
```

### Notes for the implementer

- **MIME types:** `.mp4` → `video/mp4`, `.mov` → `video/quicktime` (both confirmed working). Pass it
  explicitly to `files.upload`; don't rely on extension inference.
- **Timestamps → screenshots:** `timestampToSeconds(step.timestamp)` → `ffmpeg -ss <secs> -i video
  -frames:v 1 out.jpg`. Verified pixel-accurate.
- **Error handling:** wrap calls in `try/catch`; the SDK throws `ApiError` (`.status` number,
  `.message` JSON string). Treat `status === 429` as rate-limit (retry/backoff or swap to the backup
  key). `FileState.FAILED` does not throw — check it explicitly (handled above).
- **Cleanup (optional):** uploaded files auto-expire (~48 h). Call `ai.files.delete({ name })` after use
  if you want to be tidy; not required.
- **Repro:** `scripts/spike-models.mjs`, `scripts/spike-generate.mjs`,
  `scripts/spike-interactions-gotchas.mjs`, `scripts/spike-interactions-nested.mjs`.
