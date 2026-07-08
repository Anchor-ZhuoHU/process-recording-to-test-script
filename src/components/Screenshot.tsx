"use client";

import { useState } from "react";

type Props = { src: string | null; alt: string };

// A step's screenshot: a thumbnail that opens a click-to-zoom modal. Renders a muted placeholder
// when no frame is available (extraction failed or not run yet).
export default function Screenshot({ src, alt }: Props) {
  const [open, setOpen] = useState(false);

  if (!src) {
    return <span className="text-xs text-zinc-400">no frame</span>;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="h-16 w-auto rounded border border-zinc-200 dark:border-zinc-700"
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full rounded shadow-lg" />
        </div>
      )}
    </>
  );
}
