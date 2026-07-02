"use client";

import { useEffect, useRef, useState } from "react";
import type { PdfEditorState } from "@/hooks/usePdfEditor";
import type { TextEditRegion } from "@/lib/pdf/text-regions";
import {
  getFieldRegionAtPoint,
  getRegionFromRect,
  normalizeDragRect,
  parseRegionBlockIds,
  regionFromBlocks,
} from "@/lib/pdf/text-regions";

function estimateTextWidth(text: string, fontSize: number) {
  return Math.max(text.length * fontSize * 0.52, fontSize * 0.5);
}

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

  const pageBlocks = editor.textBlocks.filter(
    (b) => b.pageIndex === editor.currentPage
  );
  const editing = editor.editingRegion;

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

  const getPoint = (e: React.PointerEvent<HTMLElement>) => {
    const el = layerRef.current ?? e.currentTarget;
    return pointerToCanvas(e, el, canvasSize);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editing) return;
    e.preventDefault();
    const { x, y } = getPoint(e);

    if (editor.textEditSubMode === "marquee") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragStart({ x, y });
      setDragCurrent({ x, y });
      return;
    }

    // Click mode: select the whole field (e.g. "JOYASTU RAY" together)
    const region = getFieldRegionAtPoint(editor.textBlocks, editor.currentPage, x, y);
    if (region) openRegion(region);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = getPoint(e);

    if (dragStart) {
      setDragCurrent({ x, y });
      return;
    }

    if (editor.textEditSubMode === "click" && !editing) {
      const region = getFieldRegionAtPoint(editor.textBlocks, editor.currentPage, x, y);
      setHoverRegion(region);
    }
  };

  const finishMarquee = (x: number, y: number) => {
    if (!dragStart) return;
    const rect = normalizeDragRect(dragStart.x, dragStart.y, x, y);
    setDragStart(null);
    setDragCurrent(null);
    if (rect.width < 6 && rect.height < 6) return;
    const region = getRegionFromRect(editor.textBlocks, editor.currentPage, rect);
    if (region) openRegion(region);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const { x, y } = getPoint(e);
    finishMarquee(x, y);
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

      {/* Hover highlight for click mode */}
      {hoverRegion && !editing && editor.textEditSubMode === "click" && (
        <div
          className="pointer-events-none absolute border border-dashed border-blue-400 bg-blue-400/10"
          style={{
            left: hoverRegion.x - 2,
            top: hoverRegion.y - 2,
            width: hoverRegion.width + 4,
            height: hoverRegion.height + 4,
          }}
        />
      )}

      {/* Committed edits */}
      {Object.entries(editor.regionEdits).map(([regionId, text]) => {
        const blockIds = parseRegionBlockIds(regionId);
        const blocks = pageBlocks.filter((b) => blockIds.includes(b.id));
        if (blocks.length === 0) return null;
        const region = regionFromBlocks(blocks);
        if (!region) return null;
        const displayWidth = Math.max(
          region.width,
          estimateTextWidth(text, region.fontSize)
        );
        return (
          <div
            key={regionId}
            className="pointer-events-none absolute overflow-hidden whitespace-nowrap"
            style={{
              left: region.x - 1,
              top: region.y - 1,
              width: displayWidth + 2,
              height: region.height + 2,
              backgroundColor: "white",
              fontSize: region.fontSize,
              lineHeight: `${region.height}px`,
              fontFamily: "Helvetica, Arial, sans-serif",
              color: "#000",
            }}
          >
            {text}
          </div>
        );
      })}

      {/* Marquee drag rectangle */}
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

      {/* Active text editor — white cover + textarea */}
      {editing && (
        <>
          <div
            className="pointer-events-none absolute"
            style={{
              left: editing.x - 2,
              top: editing.y - 2,
              width: Math.max(
                editing.width + 4,
                estimateTextWidth(displayText, editing.fontSize) + 4
              ),
              height: editing.height + 4,
              backgroundColor: "white",
            }}
          />
          <textarea
            key={editing.id}
            ref={inputRef}
            defaultValue={displayText}
            className="absolute z-30 resize-none border-0 bg-white p-0 text-black caret-blue-600 outline outline-2 outline-blue-500"
            style={{
              left: editing.x,
              top: editing.y,
              width: Math.max(
                editing.width,
                estimateTextWidth(displayText, editing.fontSize) + 8
              ),
              minHeight: editing.height,
              fontSize: editing.fontSize,
              lineHeight: `${editing.height}px`,
              fontFamily: "Helvetica, Arial, sans-serif",
              overflow: "hidden",
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
        </>
      )}

      {/* Invisible interaction layer — only shown when not actively editing */}
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
            if (dragStart && dragCurrent) {
              finishMarquee(dragCurrent.x, dragCurrent.y);
            }
          }}
        />
      )}

      {!editor.textBlocksLoading && pageBlocks.length === 0 && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 max-w-sm -translate-x-1/2 rounded-lg bg-amber-100 px-3 py-1.5 text-center text-xs text-amber-900">
          No editable text found. Use the original PDF — exported/scanned PDFs have no text layer.
        </div>
      )}

      {!editor.textBlocksLoading && pageBlocks.length > 0 && !editing && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 max-w-md -translate-x-1/2 rounded-lg bg-blue-600/90 px-3 py-1.5 text-center text-xs text-white">
          {editor.textEditSubMode === "marquee"
            ? "Drag to select text · release to edit"
            : "Click to edit · table cells edit individually · Enter to save"}
        </div>
      )}
    </div>
  );
}
