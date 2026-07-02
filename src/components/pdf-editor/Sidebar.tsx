"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PdfEditorState } from "@/hooks/usePdfEditor";
import { loadPdfDocument } from "@/lib/pdf/pdf-loader";

interface SidebarProps {
  editor: PdfEditorState;
}

export function Sidebar({ editor }: SidebarProps) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  useEffect(() => {
    if (!editor.document) return;

    let cancelled = false;

    async function renderThumbs() {
      const pdf = await loadPdfDocument(editor.document!.bytes);
      const thumbs: string[] = [];

      for (let i = 0; i < pdf.numPages; i++) {
        if (cancelled) return;
        const page = await pdf.getPage(i + 1);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        thumbs.push(canvas.toDataURL());
      }

      if (!cancelled) setThumbnails(thumbs);
    }

    renderThumbs();
    return () => {
      cancelled = true;
    };
  }, [editor.document]);

  if (!editor.document) return null;

  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
        Pages ({editor.document.pageCount})
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {thumbnails.map((thumb, i) => (
          <button
            key={i}
            type="button"
            onClick={() => editor.setCurrentPage(i)}
            className={`mb-2 w-full rounded-lg border-2 p-1 transition ${
              editor.currentPage === i
                ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
            }`}
          >
            <img src={thumb} alt={`Page ${i + 1}`} className="w-full rounded" />
            <span className="mt-1 block text-center text-xs text-zinc-500">
              {i + 1}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-zinc-200 p-2 dark:border-zinc-800">
        <button
          type="button"
          disabled={editor.currentPage === 0}
          onClick={() => editor.setCurrentPage((p) => p - 1)}
          className="rounded p-1.5 disabled:opacity-30 hover:bg-zinc-200 dark:hover:bg-zinc-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm">
          {editor.currentPage + 1} / {editor.document.pageCount}
        </span>
        <button
          type="button"
          disabled={editor.currentPage >= editor.document.pageCount - 1}
          onClick={() => editor.setCurrentPage((p) => p + 1)}
          className="rounded p-1.5 disabled:opacity-30 hover:bg-zinc-200 dark:hover:bg-zinc-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
