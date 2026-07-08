import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

// Extract a single JPEG frame at `seconds`, downscaled to ~1280px wide, using the bundled ffmpeg
// binary (no system install needed). `-ss` before `-i` does a fast keyframe seek. Resolves to the
// raw JPEG bytes; rejects on a non-zero exit or empty output.
export function extractFrame(videoPath: string, seconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static binary not found"));
      return;
    }

    const args = [
      "-ss",
      String(Math.max(0, seconds)),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=1280:-1",
      "-q:v",
      "3",
      "-f",
      "mjpeg",
      "pipe:1",
    ];

    const proc = spawn(ffmpegPath, args);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (d: Buffer) => out.push(d));
    proc.stderr.on("data", (d: Buffer) => err.push(d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      const buf = Buffer.concat(out);
      if (code === 0 && buf.length > 0) {
        resolve(buf);
      } else {
        reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().slice(-200)}`));
      }
    });
  });
}

export function toDataUri(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

// Best-effort video duration in seconds, parsed from ffmpeg's stderr ("Duration: HH:MM:SS.xx").
// ffmpeg-static ships no ffprobe, so we read it from `ffmpeg -i`. Returns null if unparseable;
// callers treat null as "unknown" rather than failing.
export function probeDurationSeconds(videoPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (!ffmpegPath) {
      resolve(null);
      return;
    }

    const proc = spawn(ffmpegPath, ["-i", videoPath]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("error", () => resolve(null));
    proc.on("close", () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) {
        resolve(null);
        return;
      }
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}
