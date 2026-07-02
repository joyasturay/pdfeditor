"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { v4 as uuidv4 } from "uuid";
import type { PdfTextBlock } from "./types";
import { loadPdfDocument } from "./pdf-loader";
import { mergeExtractedLines } from "./text-regions";

function estimateTextWidth(text: string, fontSize: number) {
  return Math.max(text.length * fontSize * 0.52, fontSize * 0.4);
}

function clampBlockBounds(
  block: Omit<PdfTextBlock, "id">,
  pageWidth: number,
  pageHeight: number
): Omit<PdfTextBlock, "id"> {
  const fs = block.fontSize;
  const x = Math.max(0, Math.min(block.x, pageWidth - fs));
  const width = Math.min(block.width, pageWidth - x);
  const y = Math.max(0, Math.min(block.y, pageHeight - block.height));
  const height = Math.min(block.height, pageHeight - y);
  return { ...block, x, y, width: Math.max(width, fs * 0.4), height };
}

export async function extractPageTextBlocks(
  pdfDoc: PDFDocumentProxy,
  pageIndex: number,
  scale: number,
  extraRotation = 0
): Promise<PdfTextBlock[]> {
  const pdfjs = await import("pdfjs-dist");
  const page = await pdfDoc.getPage(pageIndex + 1);
  const rotation = ((page.rotate ?? 0) + extraRotation) % 360;
  const viewport = page.getViewport({ scale, rotation });
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;
  const textContent = await page.getTextContent();

  const raw: PdfTextBlock[] = [];

  for (const item of textContent.items) {
    if (!("str" in item)) continue;
    const str = item.str;
    if (!str) continue;

    const tx = pdfjs.Util.transform(viewport.transform, item.transform);
    const fontSize =
      Math.max(Math.hypot(tx[2], tx[3]), Math.hypot(tx[0], tx[1])) || 12;
    const x = tx[4];
    const y = tx[5] - fontSize;
    const scaleX = Math.hypot(tx[0], tx[1]) || 1;
    const reportedWidth = Math.abs(item.width * scaleX);
    const estimated = estimateTextWidth(str, fontSize);
    const width = Math.min(
      reportedWidth > 0 ? reportedWidth : estimated,
      estimated * 1.3
    );

    raw.push({
      id: uuidv4(),
      ...clampBlockBounds(
        {
          pageIndex,
          text: str,
          x,
          y,
          width,
          height: fontSize * 1.15,
          fontSize,
        },
        pageWidth,
        pageHeight
      ),
    });
  }

  return mergeExtractedLines(raw);
}

export async function extractAllTextBlocks(
  bytes: Uint8Array,
  scale: number,
  pageRotations: Record<number, number> = {}
): Promise<PdfTextBlock[]> {
  const pdf = await loadPdfDocument(bytes);
  const all: PdfTextBlock[] = [];

  for (let i = 0; i < pdf.numPages; i++) {
    const pageBlocks = await extractPageTextBlocks(
      pdf,
      i,
      scale,
      pageRotations[i] ?? 0
    );
    all.push(...pageBlocks);
  }

  return all;
}

export async function extractPageTextBlocksFromBytes(
  bytes: Uint8Array,
  pageIndex: number,
  scale: number,
  extraRotation = 0
): Promise<PdfTextBlock[]> {
  const pdf = await loadPdfDocument(bytes);
  return extractPageTextBlocks(pdf, pageIndex, scale, extraRotation);
}

export function getDisplayWidth(block: PdfTextBlock, maxX: number) {
  return Math.min(block.width, Math.max(maxX - block.x, block.fontSize * 0.5));
}
