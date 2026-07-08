# DECISIONS.md — Process Recording take-home

- **Company:** the company (work trial)
- **Date:** 2026-07-08
- **Window:** 3h build + 30m debrief (present ~6:30 PM ET / 3:30 PM PT)
- **Project:** Upload a screen recording of a business process, use Gemini Video Understanding
  to extract an ordered list of steps (Action / Description / Expected Result / Screenshot /
  Timestamp), render them as a table, and let users define their own columns per client template.

This log is the walkthrough spine: what was proposed, what was pushed back, and why each call
was made. Newest at the bottom.

---

## D1. Stack: Next.js full-stack, single repo (confirmed)
- Proposal (AI): Next.js 16 App Router + TypeScript; React frontend and API route handlers in
  one repo; Tailwind for a clean table UI.
- Decision: accepted. It is the company's own recommendation, and a single repo with colocated API
  routes is the least-moving-parts way to ship an upload -> process -> display slice.
- Why it matters: one deployable, one language, fastest path to a running end-to-end demo.

## D2. Video upload: always File API, never inline (confirmed)
- Context: the 5 sample videos range 3MB to 76MB; one is a 76MB Retina .mov.
- Decision: upload every video through the Gemini File API (upload + poll until ACTIVE),
  regardless of size, instead of branching to inline base64 for small ones.
- Why it matters: inline is capped at ~20MB request size and would fail on the 76MB sample.
  One code path handles all inputs and reads like production code.

## D3. Screenshots: server-side ffmpeg-static -> downscaled JPEG -> inline base64 (prototype)
- Proposal (AI): Gemini returns timestamps, not images. Extract frames ourselves. Options:
  (a) server-side ffmpeg, (b) client-side canvas seek+capture.
- Decision: server-side, using the `ffmpeg-static` bundled binary spawned directly, outputting
  a single JPEG per timestamp to stdout, downscaled to ~1280px wide, returned as a base64 data
  URI on each step.
- Why it matters: the brief says "our backend processes it and returns screenshots," so the
  backend owns extraction. `ffmpeg-static` means reviewers need no system ffmpeg install.
  Base64 keeps the prototype self-contained (no storage/serving/cleanup layer). Known tradeoff:
  base64 bloats the response and does not scale; production would write frames to object storage
  and return URLs. Full-resolution download is a stretch item.

## D4. Structured output: generateContent + responseSchema (default; spike at M2)
- Context: the company handed us the Interactions API doc (`ai.interactions.create`, `output_text`),
  which does not document schema-constrained JSON. We depend hard on structured JSON for the
  fixed columns and the user-defined columns.
- Decision: default to `ai.models.generateContent` with `responseMimeType: application/json`
  and a `responseSchema`. First thing at M2, run one real call to confirm the model name
  (`gemini-3.5-flash`, else fall back to `gemini-2.5-flash`) and that schema-constrained JSON
  returns reliably. Update this entry with the result.
- Why it matters: robust structured output is the backbone of both Part 1 and Part 2; picking
  the API path we can make bulletproof beats following the exact doc sample.
- Update (bootstrap): the installed `@google/genai@2.10.0` exposes BOTH `ai.interactions` and
  `ai.models.generateContent`, and `GenerateContentConfig` carries `responseMimeType` +
  `responseSchema` + `mediaResolution` (`Type.OBJECT/ARRAY/STRING`, `FileState.ACTIVE/PROCESSING/
  FAILED`). API mechanics are confirmed; the M2 spike now only needs to verify the model name
  and output quality on a real video.
- Update (M2, verified by live calls, separate probe session): confirmed and locked. Model
  `gemini-3.5-flash` (fallback `gemini-2.5-flash`). `generateContent` + `responseMimeType:
  application/json` + `responseSchema` returned schema-valid JSON on the first try for all 3
  in-scope videos (18-19 steps, `finishReason` STOP). The Interactions API was tried and rejected:
  it refuses a `json_schema` response_format, and its loose `array` output was coarser (10 steps vs
  18). Timestamps come back as zero-padded MM:SS, second-accurate against pixels. Leave
  `mediaResolution` unset; `maxOutputTokens` 16384; errors are thrown as `ApiError` (`.status` /
  `.message`), while `FileState.FAILED` does not throw (checked explicitly). Our first real app run
  extracted 11 clean steps from the 1:47 sample (PO `4500055191`, Material Doc `5000055610`, exact
  field values). Full reference: `resources/instruction-google-api.md`.

## D5. Processing model: synchronous request + loading state (prototype)
- Decision: `/api/process` does upload -> generate -> extract frames synchronously and returns
  the full result; the client shows a loading state. `maxDuration` raised for long videos.
- Why it matters: runs locally with no serverless timeout, and a job queue + polling would be
  over-engineering for a 3h prototype. Documented as the first thing to change for production.

## D6. Flexible columns = the Part 2 signature, built to not break generation
- Decision: user-defined text columns drive three things from one source of truth: the Gemini
  prompt, a dynamically built `responseSchema`, and the table headers. System columns
  (timestamp, screenshot) always exist and are kept separate from user columns to avoid key
  collisions. User column values live in a `values` map. Validation: >=1 column, unique
  slugified keys, non-empty labels, soft cap. Gemini output parsed with a tolerant Zod schema:
  missing fields render empty, extra fields ignored, so a bad template can degrade a cell but
  never crash the run.
- Why it matters: "make sure this doesn't break the generation" is the explicit Part 2 ask; a
  single-source, validated, tolerant pipeline is the demonstrable answer.

## D7. Timestamps: Gemini returns MM:SS (native 1 FPS), parsed to seconds for ffmpeg
- Context: Gemini samples video at 1 FPS and speaks timestamps as MM:SS.
- Decision: ask for each step's timestamp as MM:SS, parse to whole seconds, seek ffmpeg there.
  Sub-second precision is impossible by design, so second-granularity is correct, not a shortcut.

## D8. Uploaded video persistence: ephemeral temp file (prototype), object storage (production)
- Question (Anchor): a real product must persist the uploaded recording somewhere; we cannot read
  it into memory and drop it. Does the Gemini File API store it for us?
- Finding: the File API keeps files only 48h and does not let us download them back, so it is a
  transient staging area for the model, not durable storage we control. Frame extraction (ffmpeg)
  needs the real bytes anyway, so the video must live on our side during the request regardless.
- Decision: for the prototype, save the upload to one server temp file, use that same file for BOTH
  the Gemini upload and ffmpeg frame extraction, then delete it in a `finally`. The video is not
  persisted; the retained output is the test script plus inline screenshots.
- Production path (to narrate in the demo): persist the upload to object storage (S3 / GCS),
  register the GCS URI with the File API instead of re-uploading, and re-process / serve from there.
  Ephemeral temp is a deliberate, time-boxed scope cut, not an oversight.

## D9. Scope narrowing: recordings under 3 minutes, no audio
- Observation (Anchor): of the 5 provided samples, 3 are under 3 min with no audio and 2 are over
  3 min with audio, which reads as an intentional split by the interviewer.
- Decision: the product accepts only recordings strictly under 3 minutes and never analyzes audio;
  an upload over 3 minutes is rejected up front with a clear error.
- Why it matters: it locks scope to the clearly-intended happy path, keeps the pipeline focused and
  reliable inside the time box, and audio carries no test-script signal for silent screen recordings
  anyway. The Gemini API-behavior probe (run in a separate session) uses only the 3 compliant samples.

## D10. Gemini API learned empirically in a separate session; build against a narrowed instruction
- Context: we had never used this API, so coding from assumptions was a real risk. Both official
  doc variants are now local: the Interactions API version at `resources/google-api/` and the
  generateContent API version at `resources/google-api/generate-content-api/`.
- Decision: a parallel session probes the live API locally against only the 3 compliant samples
  (D9), compares both API variants, and distills a narrowed, project-specific reference at
  `resources/instruction-google-api.md`. `lib/gemini.ts` and `lib/schema.ts` are written
  against that distilled instruction, not the full official docs.
- Why it matters: the Gemini integration is coded from verified behavior (confirmed model name,
  generateContent-vs-Interactions verdict, exact output/timestamp shape) instead of guesses, and we
  keep only the slice we need. The probe's findings feed back into D4.

## D11. Progress feedback: elapsed timer + indeterminate bar (prototype UX)
- Feedback (Anchor): the first upload felt frozen; nothing signalled that the app was working
  during the 15-30s Gemini call.
- Decision: Gemini exposes no real progress, so show honest indeterminate feedback: a live
  elapsed-seconds counter, a moving bar, and a "usually 15-30s" hint, and disable the submit button
  against a double-fire.
- Why it matters: a synchronous long call needs a liveness signal. A fake percentage would be
  dishonest; an elapsed timer is truthful and enough to reassure the user.

## D12. ffmpeg-static must be external to the bundle (bug caught in M3 end-to-end testing)
- Symptom: once the route was wired, every screenshot came back null and the <3min guard never
  fired, yet the identical ffmpeg-static call worked in a standalone Node script.
- Cause: Next/Turbopack bundles the route and rewrites the path ffmpeg-static derives from its own
  file location to a non-existent bundled location, so every spawn failed silently (probe returned
  null, extractFrame rejected, both swallowed by design).
- Decision: add `serverExternalPackages: ["ffmpeg-static"]` to next.config.ts so Node resolves the
  binary from node_modules at runtime. Verified after the fix: 11/11 screenshots populate and a
  >3min video is rejected in 0.05s. (A production build would also need the binary traced into output.)
- Why it matters: only a real end-to-end run surfaced this; typecheck and a standalone script both
  passed. It is exactly why each milestone ends with a live run, not just tsc.

## D13. Known limitation: Gemini can misread long numeric IDs (mitigated by per-step screenshots)
- Finding (verification session): on one run the model read a supplier ID as 17100001 instead of
  17300001 (likely contaminated by the plant prefix 1710). A nondeterministic video-OCR misread, not
  an app or encoding bug; a re-run read it correctly and all field/action names were faithful.
- Decision: accept it as an inherent model limitation rather than over-tuning. Raising
  `mediaResolution` cost ~4x with no accuracy win in the probe; lowering temperature is an untested
  change this late and would invalidate the verified config.
- Mitigation: every step already carries the exact screenshot of that moment, so a user can spot-check
  and correct long IDs. Editable result cells (a stretch item) would make that a one-click fix.
- Why it matters: honest about where the pipeline can err, and the product design (a screenshot per
  step) turns the weakness into something verifiable instead of hidden.
