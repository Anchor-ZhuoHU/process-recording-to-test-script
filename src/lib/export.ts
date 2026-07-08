import type { ColumnDef, Step } from "./types";

// Build an RFC-4180-style CSV of the test script. Base64 screenshots are omitted (images do not
// belong in a CSV); the timestamp column lets a reader line each row up with the video. Pure, so it
// is unit-testable on its own.
export function toCsv(columns: ColumnDef[], steps: Step[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ["#", ...columns.map((c) => c.label), "Timestamp"];
  const rows = steps.map((s, i) => [
    String(i + 1),
    ...columns.map((c) => s.values[c.key] ?? ""),
    s.timestamp,
  ]);

  return [header, ...rows].map((cells) => cells.map(esc).join(",")).join("\r\n");
}

// Browser-only: trigger a download of the CSV. Kept separate from toCsv so the formatting stays
// testable. The leading BOM makes Excel open it as UTF-8 (so "Requisição" and similar render right).
export function downloadCsv(videoName: string, columns: ColumnDef[], steps: Step[]): void {
  const csv = toCsv(columns, steps);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${videoName.replace(/\.[^./\\]+$/, "") || "test-script"}-test-script.csv`;
  a.click();

  URL.revokeObjectURL(url);
}
