"use client";

import { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Annotation, PdfDocumentState, PdfTextBlock, TextEditSubMode, Tool } from "@/lib/pdf/types";
import {
  DEFAULT_COLOR,
  DEFAULT_FONT_SIZE,
  DEFAULT_STROKE_WIDTH,
  HIGHLIGHT_COLOR,
} from "@/lib/pdf/types";
import {
  addBlankPage,
  deletePdfPage,
  downloadBytes,
  exportPdfWithAnnotations,
  mergePdfBytes,
  splitPdfPage,
} from "@/lib/pdf/pdf-export";
import { extractAllTextBlocks, extractPageTextBlocksFromBytes } from "@/lib/pdf/pdf-text-extract";
import { loadPdfDocument } from "@/lib/pdf/pdf-loader";
import type { TextEditRegion } from "@/lib/pdf/text-regions";
import { parseRegionBlockIds } from "@/lib/pdf/text-regions";

const RENDER_SCALE = 1.5;

export function usePdfEditor() {
  const [document, setDocument] = useState<PdfDocumentState | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [tool, setTool] = useState<Tool>("editText");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [textBlocks, setTextBlocks] = useState<PdfTextBlock[]>([]);
  const [regionEdits, setRegionEdits] = useState<Record<string, string>>({});
  const [editingRegion, setEditingRegion] = useState<TextEditRegion | null>(null);
  const [textEditSubMode, setTextEditSubMode] = useState<TextEditSubMode>("click");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [zoom, setZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [textBlocksLoading, setTextBlocksLoading] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const loadSessionRef = useRef(0);

  const loadTextBlocks = useCallback(
    async (bytes: Uint8Array, rotations: Record<number, number> = {}) => {
      const session = ++loadSessionRef.current;
      setTextBlocksLoading(true);
      try {
        const blocks = await extractAllTextBlocks(bytes, RENDER_SCALE, rotations);
        if (session === loadSessionRef.current) {
          setTextBlocks(blocks);
        }
      } catch (err) {
        console.warn("Text extraction failed:", err);
        if (session === loadSessionRef.current) {
          setTextBlocks([]);
        }
      } finally {
        if (session === loadSessionRef.current) {
          setTextBlocksLoading(false);
        }
      }
    },
    []
  );

  const loadFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      let pdf;
      try {
        pdf = await loadPdfDocument(bytes);
      } catch (err) {
        console.error("Failed to open PDF:", err);
        alert(
          "Could not open this PDF. It may require a password — try unlocking it in Preview/Adobe first."
        );
        return;
      }

      if (/[-_]edited/i.test(file.name)) {
        alert(
          "This looks like a previously exported PDF. Upload your original admit card PDF instead — re-editing exported files causes layout distortion."
        );
      }

      setDocument({
        name: file.name.replace(/\.pdf$/i, ""),
        bytes,
        pageCount: pdf.numPages,
      });
      setCurrentPage(0);
      setAnnotations([]);
      setRegionEdits({});
      setEditingRegion(null);
      setSelectedId(null);
      setPageRotations({});
      setZoom(1);
      setTextEditSubMode("click");
      setEditorSession((s) => s + 1);
      await loadTextBlocks(bytes);
    },
    [loadTextBlocks]
  );

  const loadMultipleForMerge = useCallback(
    async (files: File[]) => {
      const pdfFiles = files.filter(
        (f) => f.type === "application/pdf" || f.name.endsWith(".pdf")
      );
      if (pdfFiles.length === 0) return;

      const allBytes = await Promise.all(
        pdfFiles.map(async (f) => new Uint8Array(await f.arrayBuffer()))
      );
      const merged = await mergePdfBytes(allBytes);

      let pdf;
      try {
        pdf = await loadPdfDocument(merged);
      } catch {
        alert("Could not open merged PDF.");
        return;
      }

      setDocument({
        name: "merged-document",
        bytes: merged,
        pageCount: pdf.numPages,
      });
      setCurrentPage(0);
      setAnnotations([]);
      setRegionEdits({});
      setEditingRegion(null);
      setSelectedId(null);
      setPageRotations({});
      setTextEditSubMode("click");
      setEditorSession((s) => s + 1);
      await loadTextBlocks(merged);
    },
    [loadTextBlocks]
  );

  const getRegionText = useCallback(
    (region: TextEditRegion) => regionEdits[region.id] ?? region.text,
    [regionEdits]
  );

  const commitRegionEdit = useCallback((region: TextEditRegion, text: string) => {
    setRegionEdits((prev) => {
      if (text === region.text) {
        const next = { ...prev };
        delete next[region.id];
        return next;
      }
      return { ...prev, [region.id]: text };
    });
    setEditingRegion(null);
  }, []);

  const startEditingRegion = useCallback((region: TextEditRegion | null) => {
    setEditingRegion(region);
  }, []);

  const addAnnotation = useCallback((partial: Omit<Annotation, "id">) => {
    const ann: Annotation = { ...partial, id: uuidv4() };
    setAnnotations((prev) => [...prev, ann]);
    return ann.id;
  }, []);

  const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
    );
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const removeAnnotationsNearPoint = useCallback(
    (pageIndex: number, x: number, y: number, radius = 20) => {
      setAnnotations((prev) =>
        prev.filter((a) => {
          if (a.pageIndex !== pageIndex) return true;
          if (a.type === "draw" && a.points) {
            return !a.points.some((p) => Math.hypot(p.x - x, p.y - y) < radius);
          }
          const cx = a.x + (a.width ?? 0) / 2;
          const cy = a.y + (a.height ?? 0) / 2;
          return Math.hypot(cx - x, cy - y) > radius + Math.max(a.width ?? 0, a.height ?? 0) / 2;
        })
      );
    },
    []
  );

  const getToolColor = useCallback(
    (activeTool: Tool) => {
      if (activeTool === "highlight") return HIGHLIGHT_COLOR;
      return color;
    },
    [color]
  );

  const updateDocumentBytes = useCallback((bytes: Uint8Array, pageCount: number) => {
    setDocument((prev) => (prev ? { ...prev, bytes, pageCount } : null));
  }, []);

  const reloadDocument = useCallback(
    async (bytes: Uint8Array, pageCount: number) => {
      updateDocumentBytes(bytes, pageCount);
      setRegionEdits({});
      setEditingRegion(null);
      await loadTextBlocks(bytes);
    },
    [loadTextBlocks, updateDocumentBytes]
  );

  const refreshPageTextBlocks = useCallback(
    async (bytes: Uint8Array, pageIndex: number) => {
      const newPageBlocks = await extractPageTextBlocksFromBytes(
        bytes,
        pageIndex,
        RENDER_SCALE
      );
      setTextBlocks((prev) => [
        ...prev.filter((b) => b.pageIndex !== pageIndex),
        ...newPageBlocks,
      ]);
      setRegionEdits({});
    },
    []
  );

  const handleDeletePage = useCallback(async () => {
    if (!document || document.pageCount <= 1) return;
    const newBytes = await deletePdfPage(document.bytes, currentPage);
    const newCount = document.pageCount - 1;

    setTextBlocks((prev) => {
      const nextBlocks = prev
        .filter((b) => b.pageIndex !== currentPage)
        .map((b) =>
          b.pageIndex > currentPage ? { ...b, pageIndex: b.pageIndex - 1 } : b
        );
      const keptIds = new Set(nextBlocks.map((b) => b.id));
      setRegionEdits((edits) => {
        const next: Record<string, string> = {};
        for (const [id, val] of Object.entries(edits)) {
          const blockIds = parseRegionBlockIds(id);
          if (blockIds.every((bid) => keptIds.has(bid))) next[id] = val;
        }
        return next;
      });
      return nextBlocks;
    });
    updateDocumentBytes(newBytes, newCount);
    setAnnotations((prev) =>
      prev
        .filter((a) => a.pageIndex !== currentPage)
        .map((a) =>
          a.pageIndex > currentPage ? { ...a, pageIndex: a.pageIndex - 1 } : a
        )
    );
    setCurrentPage((p) => Math.min(p, newCount - 1));
  }, [document, currentPage, updateDocumentBytes]);

  const handleRotatePage = useCallback(async () => {
    if (!document) return;
    const nextRotation = ((pageRotations[currentPage] ?? 0) + 90) % 360;
    setPageRotations((prev) => ({
      ...prev,
      [currentPage]: nextRotation,
    }));
    setRegionEdits({});
    const newPageBlocks = await extractPageTextBlocksFromBytes(
      document.bytes,
      currentPage,
      RENDER_SCALE,
      nextRotation
    );
    setTextBlocks((prev) => [
      ...prev.filter((b) => b.pageIndex !== currentPage),
      ...newPageBlocks,
    ]);
    setEditorSession((s) => s + 1);
  }, [document, currentPage, pageRotations]);

  const handleAddBlankPage = useCallback(async () => {
    if (!document) return;
    const newBytes = await addBlankPage(document.bytes, currentPage);
    await reloadDocument(newBytes, document.pageCount + 1);
    setCurrentPage(currentPage + 1);
  }, [document, currentPage, reloadDocument]);

  const handleSplitPage = useCallback(async () => {
    if (!document) return;
    const bytes = await splitPdfPage(document.bytes, currentPage);
    downloadBytes(bytes, `${document.name}-page-${currentPage + 1}.pdf`);
  }, [document, currentPage]);

  const handleExport = useCallback(async () => {
    if (!document) return;
    setIsExporting(true);
    try {
      const exported = await exportPdfWithAnnotations(
        document.bytes,
        annotations,
        pageRotations,
        RENDER_SCALE,
        textBlocks,
        regionEdits
      );
      downloadBytes(exported, `${document.name}-edited.pdf`);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Try saving again or re-upload the original PDF.");
    } finally {
      setIsExporting(false);
    }
  }, [document, annotations, pageRotations, textBlocks, regionEdits]);

  const reset = useCallback(() => {
    loadSessionRef.current += 1;
    setDocument(null);
    setCurrentPage(0);
    setAnnotations([]);
    setTextBlocks([]);
    setRegionEdits({});
    setEditingRegion(null);
    setSelectedId(null);
    setPageRotations({});
    setZoom(1);
    setTextBlocksLoading(false);
    setIsExporting(false);
    setTool("editText");
    setTextEditSubMode("click");
    setEditorSession((s) => s + 1);
  }, []);

  return {
    document,
    currentPage,
    setCurrentPage,
    tool,
    setTool,
    color,
    setColor,
    fontSize,
    setFontSize,
    strokeWidth,
    setStrokeWidth,
    annotations,
    textBlocks,
    regionEdits,
    textBlocksLoading,
    editingRegion,
    textEditSubMode,
    setTextEditSubMode,
    getRegionText,
    commitRegionEdit,
    startEditingRegion,
    selectedId,
    setSelectedId,
    pageRotations,
    zoom,
    setZoom,
    isExporting,
    renderScale: RENDER_SCALE,
    editorSession,
    loadFile,
    loadMultipleForMerge,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    removeAnnotationsNearPoint,
    getToolColor,
    handleDeletePage,
    handleRotatePage,
    handleAddBlankPage,
    handleSplitPage,
    handleExport,
    reset,
  };
}

export type PdfEditorState = ReturnType<typeof usePdfEditor>;
