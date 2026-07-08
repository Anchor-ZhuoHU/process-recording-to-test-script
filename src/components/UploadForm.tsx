"use client";

import { useState } from "react";
import type { ProcessResult, ProcessError } from "@/lib/types";

type Props = {
  columns: { label: string; description: string }[];
  onLoading: (v: boolean) => void;
  onResult: (r: ProcessResult) => void;
  onError: (e: string | null) => void;
};

export default function UploadForm({ columns, onLoading, onResult, onError }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) {
      return; // guard against a double-click firing a second /api/process call
    }
    if (!file) {
      onError("Please choose a video file first.");
      return;
    }

    onError(null);
    onLoading(true);
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("video", file);
      body.append(
        "columns",
        JSON.stringify(columns.map((c) => ({ label: c.label, description: c.description }))),
      );

      const res = await fetch("/api/process", { method: "POST", body });
      if (!res.ok) {
        const err = (await res.json()) as ProcessError;
        onError(err.error ?? `Request failed (${res.status})`);
        return;
      }

      const data = (await res.json()) as ProcessResult;
      onResult(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      onLoading(false);
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Styled label wraps a hidden file input, so the file picker reads as a real button. */}
        <label
          className={`cursor-pointer rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 ${
            submitting ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {file ? "Change video" : "Choose video"}
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={submitting}
            className="hidden"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !file}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {submitting ? "Generating..." : "Generate test script"}
        </button>
        <span className="min-w-0 truncate text-sm text-zinc-500">
          {file ? file.name : "No video chosen"}
        </span>
      </div>
    </form>
  );
}
