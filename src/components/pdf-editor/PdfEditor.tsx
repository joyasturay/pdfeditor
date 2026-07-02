"use client";

import type { PdfEditorState } from "@/hooks/usePdfEditor";
import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { PdfCanvas } from "./PdfCanvas";

interface PdfEditorProps {
  editor: PdfEditorState;
}

export function PdfEditor({ editor }: PdfEditorProps) {
  if (!editor.document) return null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h1 className="text-sm font-semibold">{editor.document.name}.pdf</h1>
          <p className="text-xs text-zinc-500">
            {editor.document.pageCount} pages ·{" "}
            {editor.tool === "editText"
              ? editor.textEditSubMode === "marquee"
                ? "Drag a box over text to select and edit in one go"
                : "Click any text field to edit · use area-select for large blocks"
              : "Annotate with toolbar tools · Download to export"}
          </p>
        </div>
      </header>
      <Toolbar editor={editor} />
      <div className="flex min-h-0 flex-1">
        <Sidebar editor={editor} />
        <PdfCanvas editor={editor} />
      </div>
    </div>
  );
}
