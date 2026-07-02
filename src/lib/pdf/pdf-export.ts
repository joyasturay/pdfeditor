"use client";

import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import type { Annotation, PdfTextBlock } from "./types";
import { blockTextBaseline } from "./types";
import { loadPdfDocument } from "./pdf-loader";

async function savePdf(doc: PDFDocument) {
  return doc.save({ useObjectStreams: false });
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode page image"));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/jpeg",
      0.92
    );
  });
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function canvasToPdfY(canvasY: number, pageHeight: number, scale: number) {
  return pageHeight - canvasY / scale;
}

function applyEditsToPage(
  page: PDFPage,
  pageIndex: number,
  pageHeight: number,
  scale: number,
  annotations: Annotation[],
  textBlocks: PdfTextBlock[],
  textEdits: Record<string, string>,
  font: PDFFont
) {
  const pageTextBlocks = textBlocks.filter((b) => b.pageIndex === pageIndex);
  for (const block of pageTextBlocks) {
    const newText = textEdits[block.id];
    if (newText === undefined || newText === block.text) continue;

    const pad = 2 / scale;
    page.drawRectangle({
      x: block.x / scale - pad,
      y: canvasToPdfY(block.y + block.height, pageHeight, scale) - pad,
      width: block.width / scale + pad * 2,
      height: block.height / scale + pad * 2,
      color: rgb(1, 1, 1),
    });

    page.drawText(newText, {
      x: block.x / scale,
      y: canvasToPdfY(blockTextBaseline(block), pageHeight, scale),
      size: block.fontSize / scale,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);
  for (const ann of pageAnnotations) {
    const color = hexToRgb(ann.color);

    switch (ann.type) {
      case "text": {
        if (!ann.text) break;
        const fontSize = (ann.fontSize ?? 16) / scale;
        page.drawText(ann.text, {
          x: ann.x / scale,
          y: canvasToPdfY(ann.y, pageHeight, scale) - fontSize,
          size: fontSize,
          color,
        });
        break;
      }
      case "highlight": {
        page.drawRectangle({
          x: ann.x / scale,
          y: canvasToPdfY(ann.y + (ann.height ?? 0), pageHeight, scale),
          width: (ann.width ?? 0) / scale,
          height: (ann.height ?? 0) / scale,
          color: hexToRgb(ann.color),
          opacity: 0.35,
        });
        break;
      }
      case "rectangle": {
        page.drawRectangle({
          x: ann.x / scale,
          y: canvasToPdfY(ann.y + (ann.height ?? 0), pageHeight, scale),
          width: (ann.width ?? 0) / scale,
          height: (ann.height ?? 0) / scale,
          borderColor: color,
          borderWidth: (ann.strokeWidth ?? 2) / scale,
        });
        break;
      }
      case "circle": {
        const w = (ann.width ?? 0) / scale;
        const h = (ann.height ?? 0) / scale;
        page.drawEllipse({
          x: ann.x / scale + w / 2,
          y: canvasToPdfY(ann.y, pageHeight, scale) - h / 2,
          xScale: w / 2,
          yScale: h / 2,
          borderColor: color,
          borderWidth: (ann.strokeWidth ?? 2) / scale,
        });
        break;
      }
      case "line": {
        if (!ann.points || ann.points.length < 2) break;
        const [start, end] = ann.points;
        page.drawLine({
          start: { x: start.x / scale, y: canvasToPdfY(start.y, pageHeight, scale) },
          end: { x: end.x / scale, y: canvasToPdfY(end.y, pageHeight, scale) },
          thickness: (ann.strokeWidth ?? 2) / scale,
          color,
        });
        break;
      }
      case "draw": {
        if (!ann.points || ann.points.length < 2) break;
        for (let p = 1; p < ann.points.length; p++) {
          const prev = ann.points[p - 1];
          const curr = ann.points[p];
          page.drawLine({
            start: { x: prev.x / scale, y: canvasToPdfY(prev.y, pageHeight, scale) },
            end: { x: curr.x / scale, y: canvasToPdfY(curr.y, pageHeight, scale) },
            thickness: (ann.strokeWidth ?? 2) / scale,
            color,
          });
        }
        break;
      }
    }
  }
}

/**
 * Export by rasterizing each page with pdf.js (works with encrypted PDFs),
 * then embedding the image into a new PDF and drawing edits on top.
 */
export async function exportPdfWithAnnotations(
  pdfBytes: Uint8Array,
  annotations: Annotation[],
  pageRotations: Record<number, number>,
  scale: number,
  textBlocks: PdfTextBlock[] = [],
  textEdits: Record<string, string> = {}
): Promise<Uint8Array> {
  const src = await loadPdfDocument(pdfBytes);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

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

    const jpegBytes = await canvasToJpeg(canvas);
    const image = await pdfDoc.embedJpg(jpegBytes);

    const pdfPage = pdfDoc.addPage([viewport1.width, viewport1.height]);
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: viewport1.width,
      height: viewport1.height,
    });

    applyEditsToPage(
      pdfPage,
      i,
      viewport1.height,
      scale,
      annotations,
      textBlocks,
      textEdits,
      font
    );
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
