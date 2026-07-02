"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfEditorState } from "@/hooks/usePdfEditor";
import type { Annotation, Point } from "@/lib/pdf/types";
import { loadPdfDocument, renderPageToCanvas } from "@/lib/pdf/pdf-loader";
import { drawAnnotationOnCanvas } from "@/lib/pdf/canvas-render";
import { PdfTextEditorLayer } from "./PdfTextEditorLayer";

interface PdfCanvasProps {
  editor: PdfEditorState;
}

function getCanvasPoint(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
  selected: boolean
) {
  drawAnnotationOnCanvas(ctx, ann);

  if (selected) {
    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const pad = 4;
    let bx = ann.x - pad;
    let by = ann.y - pad;
    let bw = (ann.width ?? 40) + pad * 2;
    let bh = (ann.height ?? 20) + pad * 2;
    if (ann.type === "text") {
      bh = (ann.fontSize ?? 16) + pad * 2;
      bw = Math.max(bw, (ann.text?.length ?? 1) * (ann.fontSize ?? 16) * 0.6);
    }
    if (ann.type === "draw" && ann.points?.length) {
      const xs = ann.points.map((p) => p.x);
      const ys = ann.points.map((p) => p.y);
      bx = Math.min(...xs) - pad;
      by = Math.min(...ys) - pad;
      bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
      bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
    }
    ctx.strokeRect(bx, by, bw, bh);
    ctx.restore();
  }
}

export function PdfCanvas({ editor }: PdfCanvasProps) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [pdfReady, setPdfReady] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [activeDrawId, setActiveDrawId] = useState<string | null>(null);
  const [previewAnn, setPreviewAnn] = useState<Partial<Annotation> | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const dragOffset = useRef<Point | null>(null);

  const scale = editor.renderScale;

  const pageAnnotations = editor.annotations.filter(
    (a) => a.pageIndex === editor.currentPage
  );

  // Render PDF base layer — only when document/page/scale changes
  useEffect(() => {
    if (!editor.document) return;

    let cancelled = false;
    setPdfReady(false);

    async function renderPdf() {
      const pdf = await loadPdfDocument(editor.document!.bytes);
      if (cancelled) return;

      const pdfCanvas = pdfCanvasRef.current;
      const overlay = overlayRef.current;
      if (!pdfCanvas || !overlay) return;

      const { width, height } = await renderPageToCanvas(
        pdf,
        editor.currentPage,
        pdfCanvas,
        scale,
        editor.pageRotations[editor.currentPage] ?? 0
      );

      if (cancelled) return;

      overlay.width = width;
      overlay.height = height;
      setCanvasSize({ width, height });
      setPdfReady(true);
    }

    renderPdf();
    return () => {
      cancelled = true;
    };
  }, [editor.document, editor.currentPage, editor.pageRotations, scale]);

  // Annotation overlay — only draws shapes/highlights/text annotations, NOT text edits
  // Text edits are rendered by PdfTextEditorLayer (React divs) so they exactly match the editor
  useEffect(() => {
    if (!pdfReady) return;
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const ann of pageAnnotations) {
      drawAnnotation(ctx, ann, ann.id === editor.selectedId);
    }
    if (previewAnn?.type) {
      drawAnnotation(ctx, previewAnn as Annotation, false);
    }
  }, [
    pdfReady,
    editor.currentPage,
    editor.selectedId,
    pageAnnotations,
    previewAnn,
  ]);

  const hitTest = useCallback(
    (point: Point): string | null => {
      for (let i = pageAnnotations.length - 1; i >= 0; i--) {
        const ann = pageAnnotations[i];
        if (ann.type === "draw" && ann.points) {
          for (const p of ann.points) {
            if (Math.hypot(p.x - point.x, p.y - point.y) < 12) return ann.id;
          }
        } else if (ann.type === "text") {
          const w = (ann.text?.length ?? 1) * (ann.fontSize ?? 16) * 0.6;
          const h = ann.fontSize ?? 16;
          if (
            point.x >= ann.x &&
            point.x <= ann.x + w &&
            point.y >= ann.y &&
            point.y <= ann.y + h
          ) {
            return ann.id;
          }
        } else {
          const w = ann.width ?? 20;
          const h = ann.height ?? 20;
          if (
            point.x >= ann.x &&
            point.x <= ann.x + w &&
            point.y >= ann.y &&
            point.y <= ann.y + h
          ) {
            return ann.id;
          }
        }
      }
      return null;
    },
    [pageAnnotations]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (editor.tool === "editText") return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = overlayRef.current;
    if (!canvas || !pdfReady) return;
    const point = getCanvasPoint(e, canvas);

    if (editor.tool === "text") {
      setTextInput(point);
      setTextValue("");
      return;
    }

    if (editor.tool === "eraser") {
      editor.removeAnnotationsNearPoint(editor.currentPage, point.x, point.y);
      return;
    }

    if (editor.tool === "select") {
      const hit = hitTest(point);
      editor.setSelectedId(hit);
      if (hit) {
        const ann = pageAnnotations.find((a) => a.id === hit)!;
        dragOffset.current = { x: point.x - ann.x, y: point.y - ann.y };
        setIsDrawing(true);
      }
      return;
    }

    setIsDrawing(true);
    setStartPoint(point);

    if (editor.tool === "draw") {
      const id = editor.addAnnotation({
        pageIndex: editor.currentPage,
        type: "draw",
        x: point.x,
        y: point.y,
        points: [point],
        color: editor.getToolColor("draw"),
        strokeWidth: editor.strokeWidth,
      });
      setActiveDrawId(id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayRef.current;
    if (!canvas || !pdfReady) return;
    const point = getCanvasPoint(e, canvas);

    if (editor.tool === "select" && isDrawing && editor.selectedId && dragOffset.current) {
      editor.updateAnnotation(editor.selectedId, {
        x: point.x - dragOffset.current.x,
        y: point.y - dragOffset.current.y,
      });
      return;
    }

    if (editor.tool === "draw" && isDrawing && activeDrawId) {
      const ann = editor.annotations.find((a) => a.id === activeDrawId);
      if (ann?.points) {
        editor.updateAnnotation(activeDrawId, {
          points: [...ann.points, point],
        });
      }
      return;
    }

    if (!isDrawing || !startPoint) return;

    const w = point.x - startPoint.x;
    const h = point.y - startPoint.y;
    const color = editor.getToolColor(editor.tool);

    if (editor.tool === "line") {
      setPreviewAnn({
        type: "line",
        x: startPoint.x,
        y: startPoint.y,
        points: [startPoint, point],
        color,
        strokeWidth: editor.strokeWidth,
        pageIndex: editor.currentPage,
      });
    } else if (
      editor.tool === "rectangle" ||
      editor.tool === "circle" ||
      editor.tool === "highlight"
    ) {
      setPreviewAnn({
        type: editor.tool,
        x: Math.min(startPoint.x, point.x),
        y: Math.min(startPoint.y, point.y),
        width: Math.abs(w),
        height: Math.abs(h),
        color,
        strokeWidth: editor.strokeWidth,
        pageIndex: editor.currentPage,
      });
    }
  };

  const handleMouseUp = () => {
    if (editor.tool === "select") {
      setIsDrawing(false);
      dragOffset.current = null;
      return;
    }

    if (!isDrawing) return;

    if (editor.tool === "draw") {
      setActiveDrawId(null);
      setIsDrawing(false);
      setStartPoint(null);
      return;
    }

    if (previewAnn?.type && startPoint) {
      editor.addAnnotation({
        pageIndex: editor.currentPage,
        type: previewAnn.type,
        x: previewAnn.x ?? startPoint.x,
        y: previewAnn.y ?? startPoint.y,
        width: previewAnn.width,
        height: previewAnn.height,
        points: previewAnn.points,
        color: previewAnn.color ?? editor.color,
        strokeWidth: previewAnn.strokeWidth,
      });
    }

    setPreviewAnn(null);
    setStartPoint(null);
    setIsDrawing(false);
  };

  const handleTextSubmit = () => {
    if (textInput && textValue.trim()) {
      editor.addAnnotation({
        pageIndex: editor.currentPage,
        type: "text",
        x: textInput.x,
        y: textInput.y,
        text: textValue,
        color: editor.color,
        fontSize: editor.fontSize,
      });
    }
    setTextInput(null);
    setTextValue("");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && editor.selectedId && !textInput) {
        if (
          (e.target as HTMLElement).tagName === "INPUT" ||
          (e.target as HTMLElement).tagName === "TEXTAREA"
        ) {
          return;
        }
        e.preventDefault();
        editor.removeAnnotation(editor.selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, textInput]);

  const cursorClass =
    editor.tool === "editText"
      ? "pointer-events-none"
      : editor.tool === "select"
        ? "cursor-default"
        : editor.tool === "text"
          ? "cursor-text"
          : editor.tool === "eraser"
            ? "cursor-cell"
            : "cursor-crosshair";

  return (
    <div className="relative flex flex-1 items-start justify-center overflow-auto bg-zinc-200 p-6 dark:bg-zinc-900">
      <div
        className="relative inline-block shadow-2xl"
        style={{
          transform: `scale(${editor.zoom})`,
          transformOrigin: "top center",
        }}
      >
        <canvas ref={pdfCanvasRef} className="block" />
        <canvas
          ref={overlayRef}
          className={`absolute left-0 top-0 z-10 touch-none ${cursorClass}`}
          style={
            canvasSize.width
              ? { width: canvasSize.width, height: canvasSize.height }
              : undefined
          }
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {textInput && canvasSize.width > 0 && (
          <input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") handleTextSubmit();
              if (e.key === "Escape") {
                setTextInput(null);
                setTextValue("");
              }
            }}
            onBlur={handleTextSubmit}
            className="absolute z-20 bg-white/90 outline-none"
            style={{
              left: textInput.x,
              top: textInput.y,
              fontSize: editor.fontSize,
              color: editor.color,
              border: "1px dashed #2563eb",
              minWidth: 120,
              padding: "2px 4px",
            }}
          />
        )}

        <PdfTextEditorLayer editor={editor} canvasSize={canvasSize} />
      </div>
    </div>
  );
}
