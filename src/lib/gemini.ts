import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
  FileState,
} from "@google/genai";
import { z } from "zod";
import type { ColumnDef, Step } from "./types";
import { SYSTEM_INSTRUCTION, buildTaskPrompt } from "./prompt";
import { buildResponseSchema, buildStepZod } from "./schema";

// Verified against the live API (see resources/instruction-google-api.md, D4).
export const MODEL_PRIMARY = "gemini-3.5-flash";
export const MODEL_FALLBACK = "gemini-2.5-flash";

let client: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Upload a local video through the File API and block until it leaves PROCESSING. Throws on FAILED
// (that state does not throw on its own) or if it never becomes usable.
export async function uploadVideo(
  filePath: string,
  mimeType: string,
): Promise<{ fileUri: string; mimeType: string }> {
  const ai = getAI();
  const uploaded = await ai.files.upload({ file: filePath, config: { mimeType } });

  let file = uploaded;
  const startedAt = Date.now();
  while (file.state === FileState.PROCESSING) {
    if (Date.now() - startedAt > 120_000) {
      throw new Error("Gemini file processing timed out");
    }
    await sleep(2000);
    file = await ai.files.get({ name: uploaded.name! });
  }

  if (file.state === FileState.FAILED) {
    throw new Error(`Gemini file processing failed: ${JSON.stringify(file.error)}`);
  }
  if (!file.uri) {
    throw new Error("Gemini did not return a file URI");
  }

  return { fileUri: file.uri, mimeType: file.mimeType ?? mimeType };
}

// "MM:SS" (or a bare integer) -> whole seconds. Gemini stamps at 1 FPS, so integer seconds is exact.
function parseMmSs(ts: string): number {
  const parts = ts.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) {
    return 0;
  }
  const seconds = parts.length >= 2 ? parts[0] * 60 + parts[1] : parts[0];
  return Math.max(0, seconds);
}

// Ask Gemini for the ordered steps as schema-constrained JSON, tolerantly parse them, and map to the
// app's Step shape (screenshot filled later in M3). Retries once on the fallback model if the
// primary name does not resolve (ApiError 404).
export async function extractSteps(args: {
  fileUri: string;
  mimeType: string;
  columns: ColumnDef[];
}): Promise<{ steps: Step[]; model: string }> {
  const { fileUri, mimeType, columns } = args;
  const ai = getAI();

  const run = async (model: string): Promise<string> => {
    const response = await ai.models.generateContent({
      model,
      contents: createUserContent([
        createPartFromUri(fileUri, mimeType), // video part first
        buildTaskPrompt(columns), // text prompt after the video
      ]),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: buildResponseSchema(columns),
        maxOutputTokens: 16384,
        // mediaResolution left unset: the default already reads SaaS form text (D4).
      },
    });

    const finish = response.candidates?.[0]?.finishReason;
    if (finish && String(finish) !== "STOP") {
      throw new Error(`Gemini did not finish cleanly (finishReason=${String(finish)})`);
    }
    return response.text ?? "[]";
  };

  let model = MODEL_PRIMARY;
  let raw: string;
  try {
    raw = await run(MODEL_PRIMARY);
  } catch (err) {
    if (isModelNotFound(err)) {
      model = MODEL_FALLBACK;
      raw = await run(MODEL_FALLBACK);
    } else {
      throw err;
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  // Tolerant: bad elements drop to defaults, extra keys are ignored, a broken payload yields [].
  const result = z.array(buildStepZod(columns)).safeParse(parsed);
  const rawSteps = (result.success ? result.data : []) as Array<Record<string, string>>;

  const steps: Step[] = rawSteps.map((rawStep) => {
    const values: Record<string, string> = {};
    for (const c of columns) {
      values[c.key] = rawStep[c.key] ?? "";
    }
    const timestamp = rawStep.timestamp ?? "00:00";
    return {
      values,
      timestamp,
      timestampSeconds: parseMmSs(timestamp),
      screenshot: null,
    };
  });

  return { steps, model };
}

function isModelNotFound(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  return status === 404 || /not found/i.test(message);
}
