import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_COLUMNS, validateColumns } from "@/lib/columns";
import { uploadVideo, extractSteps } from "@/lib/gemini";
import { extractFrame, toDataUri, probeDurationSeconds } from "@/lib/frames";
import type { ProcessResult } from "@/lib/types";

// The pipeline needs Node APIs (temp files, and ffmpeg spawn in M3), and video processing is slow,
// so pin the Node runtime with a generous budget.
export const runtime = "nodejs";
export const maxDuration = 300;

// Browsers usually set File.type; fall back to extension so .mov maps to video/quicktime.
function inferMimeType(name: string, provided: string): string {
  if (provided) {
    return provided;
  }
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return "video/mp4";
}

// Upload the recording to Gemini, extract the ordered steps as schema-constrained JSON, reject
// videos over 3 minutes up front (D9), and attach an ffmpeg screenshot per step.
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();

  const video = form.get("video");
  if (!(video instanceof File) || video.size === 0) {
    return Response.json({ error: "a non-empty video file is required" }, { status: 400 });
  }

  let columns = DEFAULT_COLUMNS;
  const columnsRaw = form.get("columns");
  if (typeof columnsRaw === "string" && columnsRaw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(columnsRaw);
    } catch {
      return Response.json({ error: "columns must be valid JSON" }, { status: 400 });
    }
    const result = validateColumns(parsed);
    if (!result.ok) {
      return Response.json({ error: result.errors.join("; ") }, { status: 400 });
    }
    columns = result.columns;
  }

  const mimeType = inferMimeType(video.name, video.type);
  const tempPath = join(tmpdir(), `${randomUUID()}-${video.name}`);

  try {
    await writeFile(tempPath, Buffer.from(await video.arrayBuffer()));

    const duration = await probeDurationSeconds(tempPath);
    if (duration !== null && duration > 180) {
      return Response.json({ error: "video must be under 3 minutes" }, { status: 400 });
    }

    const uploaded = await uploadVideo(tempPath, mimeType);
    const { steps, model } = await extractSteps({
      fileUri: uploaded.fileUri,
      mimeType: uploaded.mimeType,
      columns,
    });

    // Attach a screenshot per step. A single frame failure degrades that cell to null and never
    // fails the whole run. Seek is clamped just inside the duration when we know it.
    await Promise.all(
      steps.map(async (step) => {
        const seconds =
          duration !== null
            ? Math.min(step.timestampSeconds, Math.max(0, duration - 0.1))
            : step.timestampSeconds;
        try {
          step.screenshot = toDataUri(await extractFrame(tempPath, seconds));
        } catch {
          step.screenshot = null;
        }
      }),
    );

    const body: ProcessResult = { steps, columns, videoName: video.name, model };
    return Response.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "processing failed";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}
