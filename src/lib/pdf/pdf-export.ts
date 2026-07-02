"use client";

import { PDFDocument } from "pdf-lib";
import type { Annotation, PdfTextBlock } from "./types";
import { drawAnnotationOnCanvas, drawRegionEditsOnCanvas } from "./canvas-render";
import { loadPdfDocument } from "./pdf-loader";

async function savePdf(doc: PDFDocument) {
  return doc.save({ useObjectStreams: false });
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode page image"));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/png"
    );
  });
}

/**
 * Export by rasterizing each page with pdf.js (works with encrypted PDFs),
 * baking text edits and annotations into the canvas first so export matches preview.
 */
export async function exportPdfWithAnnotations(
  pdfBytes: Uint8Array,
  annotations: Annotation[],
  pageRotations: Record<number, number>,
  scale: number,
  textBlocks: PdfTextBlock[] = [],
  regionEdits: Record<string, string> = {}
): Promise<Uint8Array> {
  const src = await loadPdfDocument(pdfBytes);
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < src.numPages; i++) {
    const page = await src.getPage(i + 1);
    const rotation = ((page.rotate ?? 0) + (pageRotations[i] ?? 0)) % 360;
    const viewport1 = page.getViewport({ scale: 1, rotation });
    const viewportRender = page.getViewport({ scale, rotation });

    const canvas = document.createElement("canvas");
    canvas.width = viewportRender.width;
    canvas.height = viewportRender.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewportRender,
      canvas,
    }).promise;

    drawRegionEditsOnCanvas(ctx, ctx, i, textBlocks, regionEdits);

    const pageAnnotations = annotations.filter((a) => a.pageIndex === i);
    for (const ann of pageAnnotations) {
      drawAnnotationOnCanvas(ctx, ann);
    }

    const pngBytes = await canvasToPng(canvas);
    const image = await pdfDoc.embedPng(pngBytes);

    const pdfPage = pdfDoc.addPage([viewport1.width, viewport1.height]);
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: viewport1.width,
      height: viewport1.height,
    });
  }

  return savePdf(pdfDoc);
}

export async function mergePdfBytes(sources: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const bytes of sources) {
    const exported = await exportPdfWithAnnotations(bytes, [], {}, 1.5);
    const doc = await PDFDocument.load(exported);
    const copied = await merged.copyPages(doc, doc.getPageIndices());
    copied.forEach((page) => merged.addPage(page));
  }
  return savePdf(merged);
}

export async function splitPdfPage(
  pdfBytes: Uint8Array,
  pageIndex: number
): Promise<Uint8Array> {
  const flat = await exportPdfWithAnnotations(pdfBytes, [], {}, 1.5);
  const source = await PDFDocument.load(flat);
  const newDoc = await PDFDocument.create();
  const [page] = await newDoc.copyPages(source, [pageIndex]);
  newDoc.addPage(page);
  return savePdf(newDoc);
}

export async function deletePdfPage(
  pdfBytes: Uint8Array,
  pageIndex: number
): Promise<Uint8Array> {
  const flat = await exportPdfWithAnnotations(pdfBytes, [], {}, 1.5);
  const doc = await PDFDocument.load(flat);
  doc.removePage(pageIndex);
  return savePdf(doc);
}

export async function rotatePdfPage(
  pdfBytes: Uint8Array,
  pageIndex: number,
  degreesValue: number
): Promise<Uint8Array> {
  return exportPdfWithAnnotations(
    pdfBytes,
    [],
    { [pageIndex]: degreesValue },
    1.5
  );
}

export async function addBlankPage(
  pdfBytes: Uint8Array,
  afterIndex: number
): Promise<Uint8Array> {
  const flat = await exportPdfWithAnnotations(pdfBytes, [], {}, 1.5);
  const doc = await PDFDocument.load(flat);
  const refPage = doc.getPage(Math.min(afterIndex, doc.getPageCount() - 1));
  const { width, height } = refPage.getSize();
  doc.insertPage(afterIndex + 1, [width, height]);
  return savePdf(doc);
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
