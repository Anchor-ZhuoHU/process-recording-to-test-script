import { DEFAULT_COLUMNS, validateColumns } from "@/lib/columns";
import type { ProcessResult, Step } from "@/lib/types";

// The pipeline needs Node APIs (temp files, ffmpeg spawn) in later milestones, and long videos
// need a generous budget, so pin the Node runtime here from the start.
export const runtime = "nodejs";
export const maxDuration = 300;

// M1 walking skeleton: parse + validate the request, then return a hardcoded 2-step stub whose
// values match the requested columns. The real Gemini call and screenshots arrive in M2 and M3.
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

  const stubStep = (n: number): Step => ({
    values: Object.fromEntries(
      columns.map((c) => [c.key, `[stub] ${c.label} for step ${n}`]),
    ),
    timestamp: n === 1 ? "00:03" : "00:10",
    timestampSeconds: n === 1 ? 3 : 10,
    screenshot: null,
  });

  const body: ProcessResult = {
    steps: [stubStep(1), stubStep(2)],
    columns,
    videoName: video.name,
    model: "stub",
  };

  return Response.json(body);
}
