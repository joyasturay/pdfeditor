"use client";

import { useEffect, useRef, useState } from "react";
import type { PdfEditorState } from "@/hooks/usePdfEditor";
import type { PdfTextBlock } from "@/lib/pdf/types";
import { getDisplayWidth } from "@/lib/pdf/pdf-text-extract";

interface PdfTextEditorLayerProps {
  editor: PdfEditorState;
  canvasSize: { width: number; height: number };
}

export function PdfTextEditorLayer({ editor, canvasSize }: PdfTextEditorLayerProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageBlocks = editor.textBlocks.filter(
    (b) => b.pageIndex === editor.currentPage
  );
  const editingBlock = pageBlocks.find((b) => b.id === editor.editingTextBlockId);

  useEffect(() => {
    if (editingBlock && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingBlock?.id]);

  if (editor.tool !== "editText" || canvasSize.width === 0) return null;

  const commitEdit = (block: PdfTextBlock, value: string) => {
    editor.updateTextEdit(block.id, value);
    editor.setEditingTextBlockId(null);
  };

  const displayWidth = (block: PdfTextBlock) =>
    getDisplayWidth(block, canvasSize.width);

  return (
    <div
      className="absolute left-0 top-0 z-20 overflow-hidden"
      style={{ width: canvasSize.width, height: canvasSize.height }}
    >
      {editor.textBlocksLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/40 text-sm text-zinc-600">
          Detecting text…
        </div>
      )}

      {pageBlocks.map((block) => {
        const isEditing = editor.editingTextBlockId === block.id;
        const isHovered = hoveredId === block.id;
        const displayText = editor.getBlockText(block);
        const isModified = displayText !== block.text;
        const w = displayWidth(block);

        if (isEditing) {
          const inputWidth = Math.min(
            canvasSize.width - block.x,
            Math.max(w, displayText.length * block.fontSize * 0.55 + 8)
          );
          return (
            <input
              key={block.id}
              ref={inputRef}
              type="text"
              defaultValue={displayText}
              className="absolute m-0 border-0 bg-transparent p-0 text-black caret-blue-600 outline outline-1 outline-blue-500"
              style={{
                left: block.x,
                top: block.y,
                width: inputWidth,
                height: block.height,
                fontSize: block.fontSize,
                lineHeight: `${block.height}px`,
                fontFamily: "Helvetica, Arial, sans-serif",
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") editor.setEditingTextBlockId(null);
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit(block, (e.target as HTMLInputElement).value);
                }
              }}
              onBlur={(e) => commitEdit(block, e.target.value)}
            />
          );
        }

        return (
          <button
            key={block.id}
            type="button"
            title={`Edit: "${block.text}"`}
            onMouseEnter={() => setHoveredId(block.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => editor.setEditingTextBlockId(block.id)}
            className="absolute cursor-text border-0 bg-transparent p-0 text-left"
            style={{
              left: block.x,
              top: block.y,
              width: w,
              height: block.height,
              fontSize: block.fontSize,
              lineHeight: `${block.height}px`,
              fontFamily: "Helvetica, Arial, sans-serif",
              color: isModified ? "#000000" : "transparent",
              background: isModified ? "rgba(255,255,255,0.92)" : "transparent",
              outline: isHovered
                ? "1px dashed rgba(37,99,235,0.7)"
                : isModified
                  ? "1px solid rgba(37,99,235,0.5)"
                  : "none",
            }}
          >
            {isModified ? displayText : ""}
          </button>
        );
      })}

      {!editor.textBlocksLoading && pageBlocks.length === 0 && (
        <div className="absolute bottom-2 left-1/2 max-w-sm -translate-x-1/2 rounded-lg bg-amber-100 px-3 py-1.5 text-center text-xs text-amber-900">
          No editable text found. Use the original PDF — exported/image PDFs cannot be
          text-edited.
        </div>
      )}

      {!editor.textBlocksLoading && pageBlocks.length > 0 && !editingBlock && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-lg bg-blue-600/90 px-3 py-1.5 text-xs text-white">
          Click text to edit in place · Enter to save · Esc to cancel
        </div>
      )}
    </div>
  );
}
