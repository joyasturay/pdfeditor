"use client";

import {
  MousePointer2,
  Type,
  Pencil,
  Highlighter,
  Square,
  Circle,
  Minus,
  Eraser,
  ZoomIn,
  ZoomOut,
  Download,
  RotateCw,
  Trash2,
  FilePlus,
  Scissors,
  Undo2,
  TextCursorInput,
  Scan,
} from "lucide-react";
import type { PdfEditorState } from "@/hooks/usePdfEditor";
import type { Tool } from "@/lib/pdf/types";
import { TOOL_LABELS } from "@/lib/pdf/types";

const TOOLS: { id: Tool; icon: typeof MousePointer2 }[] = [
  { id: "editText", icon: TextCursorInput },
  { id: "select", icon: MousePointer2 },
  { id: "text", icon: Type },
  { id: "draw", icon: Pencil },
  { id: "highlight", icon: Highlighter },
  { id: "rectangle", icon: Square },
  { id: "circle", icon: Circle },
  { id: "line", icon: Minus },
  { id: "eraser", icon: Eraser },
];

interface ToolbarProps {
  editor: PdfEditorState;
}

export function Toolbar({ editor }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {TOOLS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            title={TOOL_LABELS[id]}
            onClick={() => {
              editor.startEditingRegion(null);
              editor.setTool(id);
            }}
            className={`rounded-lg p-2 transition ${
              editor.tool === id
                ? "bg-blue-600 text-white shadow"
                : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      {editor.tool === "editText" && (
        <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
          <button
            type="button"
            title="Click to edit text"
            onClick={() => editor.setTextEditSubMode("click")}
            className={`rounded-lg p-2 transition ${
              editor.textEditSubMode === "click"
                ? "bg-blue-600 text-white shadow"
                : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            <TextCursorInput className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Drag to select text area"
            onClick={() => editor.setTextEditSubMode("marquee")}
            className={`rounded-lg p-2 transition ${
              editor.textEditSubMode === "marquee"
                ? "bg-blue-600 text-white shadow"
                : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            <Scan className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700" />

      <input
        type="color"
        value={editor.color}
        onChange={(e) => editor.setColor(e.target.value)}
        title="Color"
        className="h-9 w-9 cursor-pointer rounded-lg border border-zinc-200 bg-transparent p-0.5 dark:border-zinc-700"
      />

      {editor.tool === "text" && (
        <input
          type="number"
          min={8}
          max={72}
          value={editor.fontSize}
          onChange={(e) => editor.setFontSize(Number(e.target.value))}
          title="Font size"
          className="w-16 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}

      {(editor.tool === "draw" ||
        editor.tool === "line" ||
        editor.tool === "rectangle" ||
        editor.tool === "circle") && (
        <input
          type="number"
          min={1}
          max={20}
          value={editor.strokeWidth}
          onChange={(e) => editor.setStrokeWidth(Number(e.target.value))}
          title="Stroke width"
          className="w-16 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}

      <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700" />

      <button
        type="button"
        title="Zoom out"
        onClick={() => editor.setZoom((z) => Math.max(0.5, z - 0.25))}
        className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <span className="min-w-12 text-center text-sm text-zinc-500">
        {Math.round(editor.zoom * 100)}%
      </span>
      <button
        type="button"
        title="Zoom in"
        onClick={() => editor.setZoom((z) => Math.min(3, z + 0.25))}
        className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <ZoomIn className="h-4 w-4" />
      </button>

      <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700" />

      <button
        type="button"
        title="Rotate page"
        onClick={editor.handleRotatePage}
        className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <RotateCw className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Add blank page"
        onClick={editor.handleAddBlankPage}
        className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <FilePlus className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Delete page"
        onClick={editor.handleDeletePage}
        className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Extract current page"
        onClick={editor.handleSplitPage}
        className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <Scissors className="h-4 w-4" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          title="Close document"
          onClick={editor.reset}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Undo2 className="h-4 w-4" />
          New
        </button>
        <button
          type="button"
          disabled={editor.isExporting}
          onClick={editor.handleExport}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {editor.isExporting ? "Exporting…" : "Download"}
        </button>
      </div>
    </div>
  );
}
