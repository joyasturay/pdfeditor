"use client";

import { useEffect, useRef, useState } from "react";
import type { PdfEditorState } from "@/hooks/usePdfEditor";
import type { TextEditRegion } from "@/lib/pdf/text-regions";
import {
  getRegionInRect,
  hitTestBlock,
  normalizeDragRect,
  parseRegionBlockIds,
  regionFromBlocks,
} from "@/lib/pdf/text-regions";
import { getDisplayWidth } from "@/lib/pdf/pdf-text-extract";

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

    const hit = hitTestBlock(editor.textBlocks, editor.currentPage, x, y);
    if (hit) {
      const region = regionFromBlocks([hit]);
      if (region) openRegion(region);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = getPoint(e);

    if (dragStart) {
      setDragCurrent({ x, y });
      return;
    }

    if (editor.textEditSubMode === "click" && !editing) {
      const hit = hitTestBlock(editor.textBlocks, editor.currentPage, x, y);
      setHoverRegion(hit ? regionFromBlocks([hit]) : null);
    }
  };

  const finishMarquee = (x: number, y: number) => {
    if (!dragStart) return;
    const rect = normalizeDragRect(dragStart.x, dragStart.y, x, y);
    setDragStart(null);
    setDragCurrent(null);
    if (rect.width < 6 && rect.height < 6) return;
    const region = getRegionInRect(editor.textBlocks, editor.currentPage, rect);
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

      {hoverRegion && !editing && editor.textEditSubMode === "click" && (
        <div
          className="pointer-events-none absolute border border-dashed border-blue-500 bg-blue-500/10"
          style={{
            left: hoverRegion.x,
            top: hoverRegion.y,
            width: getDisplayWidth(
              {
                id: hoverRegion.id,
                pageIndex: hoverRegion.pageIndex,
                text: hoverRegion.text,
                x: hoverRegion.x,
                y: hoverRegion.y,
                width: hoverRegion.width,
                height: hoverRegion.height,
                fontSize: hoverRegion.fontSize,
              },
              canvasSize.width
            ),
            height: hoverRegion.height,
          }}
        />
      )}

      {Object.entries(editor.regionEdits).map(([regionId, text]) => {
        const blockIds = parseRegionBlockIds(regionId);
        const blocks = pageBlocks.filter((b) => blockIds.includes(b.id));
        if (blocks.length === 0) return null;
        const region = regionFromBlocks(blocks);
        if (!region) return null;
        return (
          <div
            key={regionId}
            className="pointer-events-none absolute bg-white/95 px-0.5 text-black"
            style={{
              left: region.x,
              top: region.y,
              width: getDisplayWidth(
                {
                  id: region.id,
                  pageIndex: region.pageIndex,
                  text: region.text,
                  x: region.x,
                  y: region.y,
                  width: region.width,
                  height: region.height,
                  fontSize: region.fontSize,
                },
                canvasSize.width
              ),
              height: region.height,
              fontSize: region.fontSize,
              lineHeight: `${region.height}px`,
              fontFamily: "Helvetica, Arial, sans-serif",
            }}
          >
            {text}
          </div>
        );
      })}

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

      {editing && (
        <>
          <div
            className="pointer-events-none absolute bg-white"
            style={{
              left: editing.x - 2,
              top: editing.y - 2,
              width: Math.min(
                canvasSize.width - editing.x + 2,
                Math.max(editing.width + 4, displayText.length * editing.fontSize * 0.5)
              ),
              height: Math.max(editing.height + 4, editing.fontSize * 1.4),
            }}
          />
          <textarea
            key={editing.id}
            ref={inputRef}
            defaultValue={displayText}
            className="absolute z-30 resize-none overflow-hidden border-0 bg-transparent p-0 text-black caret-blue-600 outline outline-1 outline-blue-500"
            style={{
              left: editing.x,
              top: editing.y,
              width: Math.min(
                canvasSize.width - editing.x,
                Math.max(editing.width, displayText.length * editing.fontSize * 0.52 + 16)
              ),
              minHeight: editing.height,
              fontSize: editing.fontSize,
              lineHeight: 1.2,
              fontFamily: "Helvetica, Arial, sans-serif",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                editor.startEditingRegion(null);
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
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
          No editable text found. Use the original PDF — exported/image PDFs cannot be
          text-edited.
        </div>
      )}

      {!editor.textBlocksLoading && pageBlocks.length > 0 && !editing && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 max-w-md -translate-x-1/2 rounded-lg bg-blue-600/90 px-3 py-1.5 text-center text-xs text-white">
          {editor.textEditSubMode === "marquee"
            ? "Drag to select text · release to edit · Esc to cancel"
            : "Click any text to edit · Ctrl+Enter to save"}
        </div>
      )}
    </div>
  );
}
