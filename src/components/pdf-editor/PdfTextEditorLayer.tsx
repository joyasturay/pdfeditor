"use client";

import { useEffect, useRef, useState } from "react";
import type { PdfEditorState } from "@/hooks/usePdfEditor";
import type { TextEditRegion } from "@/lib/pdf/text-regions";
import {
  getLineRegionAtPoint,
  getRegionInRect,
  hitTestBlock,
  normalizeDragRect,
} from "@/lib/pdf/text-regions";

interface PdfTextEditorLayerProps {
  editor: PdfEditorState;
  canvasSize: { width: number; height: number };
}

function pointerToCanvas(
  e: React.PointerEvent<HTMLElement>,
  el: HTMLElement,
  canvasSize: { width: number; height: number }
) {
  const rect = el.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvasSize.width,
    y: ((e.clientY - rect.top) / rect.height) * canvasSize.height,
  };
}

export function PdfTextEditorLayer({ editor, canvasSize }: PdfTextEditorLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const skipBlurRef = useRef(false);
  const [hoverRegion, setHoverRegion] = useState<TextEditRegion | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  const editing = editor.editingRegion;

  // Focus textarea when an edit opens.
  useEffect(() => {
    if (editing && inputRef.current) {
      skipBlurRef.current = true;
      inputRef.current.focus();
      inputRef.current.select();
      requestAnimationFrame(() => {
        skipBlurRef.current = false;
      });
    }
  }, [editing?.id]);

  if (editor.tool !== "editText" || canvasSize.width === 0) return null;

  const openRegion = (region: TextEditRegion | null) => {
    if (region) editor.startEditingRegion(region);
  };

  const getPoint = (e: React.PointerEvent<HTMLElement>) =>
    pointerToCanvas(e, layerRef.current ?? e.currentTarget, canvasSize);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editing) return;
    e.preventDefault();
    const pt = getPoint(e);

    if (editor.textEditSubMode === "marquee") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragStart(pt);
      setDragCurrent(pt);
      return;
    }

    const hit = hitTestBlock(editor.textBlocks, editor.currentPage, pt.x, pt.y);
    if (hit) {
      openRegion(getLineRegionAtPoint(editor.textBlocks, editor.currentPage, pt.x, pt.y));
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pt = getPoint(e);
    if (dragStart) {
      setDragCurrent(pt);
      return;
    }
    if (editor.textEditSubMode === "click" && !editing) {
      const hit = hitTestBlock(editor.textBlocks, editor.currentPage, pt.x, pt.y);
      setHoverRegion(
        hit ? getLineRegionAtPoint(editor.textBlocks, editor.currentPage, pt.x, pt.y) : null
      );
    }
  };

  const finishMarquee = (x: number, y: number) => {
    if (!dragStart) return;
    const rect = normalizeDragRect(dragStart.x, dragStart.y, x, y);
    setDragStart(null);
    setDragCurrent(null);
    if (rect.width < 6 && rect.height < 6) return;
    openRegion(getRegionInRect(editor.textBlocks, editor.currentPage, rect));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const pt = getPoint(e);
    finishMarquee(pt.x, pt.y);
  };

  const commitEdit = (value: string) => {
    if (!editing) return;
    editor.commitRegionEdit(editing, value);
  };

  const previewRect =
    dragStart && dragCurrent
      ? normalizeDragRect(dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y)
      : null;

  const displayText = editing ? editor.getRegionText(editing) : "";

  // Textarea sizing: fit the text or at least the region width.
  const textareaWidth = editing
    ? Math.min(
        canvasSize.width - editing.x - 2,
        Math.max(editing.width, displayText.length * editing.fontSize * 0.6 + 16)
      )
    : 0;
  const textareaHeight = editing ? Math.max(editing.height + 2, editing.fontSize * 1.4) : 0;

  return (
    <div
      ref={layerRef}
      className="absolute left-0 top-0 z-20 overflow-hidden"
      style={{ width: canvasSize.width, height: canvasSize.height }}
    >
      {editor.textBlocksLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/40 text-sm text-zinc-600">
          Detecting text…
        </div>
      )}

      {/* Hover highlight — click mode only */}
      {hoverRegion && !editing && editor.textEditSubMode === "click" && (
        <div
          className="pointer-events-none absolute border border-dashed border-blue-500 bg-blue-500/10"
          style={{
            left: hoverRegion.x,
            top: hoverRegion.y,
            width: hoverRegion.width,
            height: hoverRegion.height,
          }}
        />
      )}

      {/* Marquee drag preview */}
      {previewRect && (
        <div
          className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/15"
          style={{
            left: previewRect.x,
            top: previewRect.y,
            width: previewRect.width,
            height: previewRect.height,
          }}
        />
      )}

      {/* Active text editor — floats over the canvas-drawn white box */}
      {editing && (
        <textarea
          key={editing.id}
          ref={inputRef}
          defaultValue={displayText}
          rows={1}
          className="absolute z-30 resize-none rounded-none border border-blue-500 bg-white p-0 px-0.5 text-black outline-none"
          style={{
            left: editing.x,
            top: editing.y,
            width: textareaWidth,
            height: textareaHeight,
            minHeight: editing.fontSize * 1.3,
            fontSize: editing.fontSize,
            lineHeight: `${editing.fontSize * 1.15}px`,
            fontFamily: "Helvetica, Arial, sans-serif",
            caretColor: "#2563eb",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              e.preventDefault();
              editor.startEditingRegion(null);
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitEdit((e.target as HTMLTextAreaElement).value);
            }
          }}
          onBlur={(e) => {
            if (skipBlurRef.current) return;
            commitEdit(e.target.value);
          }}
        />
      )}

      {/* Interaction surface — shown only when not editing */}
      {!editing && (
        <div
          className={`absolute inset-0 touch-none ${
            editor.textEditSubMode === "marquee" ? "cursor-crosshair" : "cursor-text"
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            setHoverRegion(null);
            if (dragStart && dragCurrent) finishMarquee(dragCurrent.x, dragCurrent.y);
          }}
        />
      )}

      {/* Status hints */}
      {!editor.textBlocksLoading && editor.textBlocks.filter((b) => b.pageIndex === editor.currentPage).length === 0 && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 max-w-sm -translate-x-1/2 rounded-lg bg-amber-100 px-3 py-1.5 text-center text-xs text-amber-900">
          No editable text found on this page. Make sure you uploaded the original PDF.
        </div>
      )}

      {!editor.textBlocksLoading && editor.textBlocks.filter((b) => b.pageIndex === editor.currentPage).length > 0 && !editing && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 max-w-md -translate-x-1/2 rounded-lg bg-blue-600/90 px-3 py-1.5 text-center text-xs text-white">
          {editor.textEditSubMode === "marquee"
            ? "Drag to select text · release to edit · Esc to cancel"
            : "Click any text to edit · Enter to save · Esc to cancel"}
        </div>
      )}
    </div>
  );
}
