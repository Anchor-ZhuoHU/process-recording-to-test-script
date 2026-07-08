"use client";

import { useEffect, useState } from "react";

// Indeterminate feedback for the /api/process call. Gemini reports no real progress, so we show a
// live elapsed-seconds counter plus a moving bar: the point is to prove work is happening and the
// page has not frozen, which was the confusing part of the first upload.
export default function ProgressIndicator() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-6" role="status" aria-live="polite">
      <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300">
        <span>Generating test script...</span>
        <span className="tabular-nums text-zinc-500">{seconds}s</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="animate-indeterminate h-full w-1/3 rounded-full bg-zinc-900 dark:bg-white" />
      </div>
      <p className="mt-1.5 text-xs text-zinc-400">
        Uploading the video to Gemini and analyzing it. This usually takes 15 to 30 seconds.
      </p>
    </div>
  );
}
