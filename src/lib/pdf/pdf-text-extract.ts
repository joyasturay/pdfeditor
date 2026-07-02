"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { v4 as uuidv4 } from "uuid";
import type { PdfTextBlock } from "./types";
import { loadPdfDocument } from "./pdf-loader";

function estimateTextWidth(text: string, fontSize: number) {
  return Math.max(text.length * fontSize * 0.52, fontSize * 0.4);
}

function clampBlockBounds(
  block: Omit<PdfTextBlock, "id">,
  pageWidth: number,
  pageHeight: number
): Omit<PdfTextBlock, "id"> {
  const x = Math.max(0, Math.min(block.x, pageWidth - fontSize(block)));
  const width = Math.min(block.width, pageWidth - x);
  const y = Math.max(0, Math.min(block.y, pageHeight - block.height));
  const height = Math.min(block.height, pageHeight - y);
  return { ...block, x, y, width: Math.max(width, fontSize(block) * 0.4), height };
}

function fontSize(block: Pick<PdfTextBlock, "fontSize">) {
  return block.fontSize;
}

function itemToBlocks(
  str: string,
  x: number,
  y: number,
  fontSize: number,
  reportedWidth: number,
  pageIndex: number,
  pageWidth: number,
  pageHeight: number
): PdfTextBlock[] {
  const estimated = estimateTextWidth(str, fontSize);
  const useWordSplit = str.includes(" ") && reportedWidth > estimated * 1.6;

  if (useWordSplit) {
    const words = str.trim().split(/\s+/);
    const blocks: PdfTextBlock[] = [];
    let cx = x;

    for (const word of words) {
      const wordWidth = estimateTextWidth(word, fontSize);
      if (cx >= pageWidth - 4) break;

      const wordBlock = clampBlockBounds(
        {
          pageIndex,
          text: word,
          x: cx,
          y,
          width: wordWidth,
          height: fontSize * 1.15,
          fontSize,
        },
        pageWidth,
        pageHeight
      );

      blocks.push({ id: uuidv4(), ...wordBlock });
      cx += wordWidth + fontSize * 0.28;
    }

    return blocks;
  }

  const width = Math.min(
    reportedWidth > 0 ? reportedWidth : estimated,
    estimated * 1.25
  );

  return [
    {
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
    },
  ];
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

  const blocks: PdfTextBlock[] = [];

  for (const item of textContent.items) {
    if (!("str" in item)) continue;
    const str = item.str;
    if (!str.trim()) continue;

    const tx = pdfjs.Util.transform(viewport.transform, item.transform);
    const fontSize =
      Math.max(Math.hypot(tx[2], tx[3]), Math.hypot(tx[0], tx[1])) || 12;
    const x = tx[4];
    const y = tx[5] - fontSize;
    const scaleX = Math.hypot(tx[0], tx[1]) || 1;
    const reportedWidth = Math.abs(item.width * scaleX);

    blocks.push(
      ...itemToBlocks(str, x, y, fontSize, reportedWidth, pageIndex, pageWidth, pageHeight)
    );
  }

  return blocks;
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

export function hitTestTextBlock(
  blocks: PdfTextBlock[],
  pageIndex: number,
  x: number,
  y: number
): PdfTextBlock | null {
  const pageBlocks = blocks.filter((b) => b.pageIndex === pageIndex);
  for (let i = pageBlocks.length - 1; i >= 0; i--) {
    const b = pageBlocks[i];
    const pad = 2;
    if (
      x >= b.x - pad &&
      x <= b.x + b.width + pad &&
      y >= b.y - pad &&
      y <= b.y + b.height + pad
    ) {
      return b;
    }
  }
  return null;
}

export function getDisplayWidth(block: PdfTextBlock, maxX: number) {
  return Math.min(block.width, Math.max(maxX - block.x, block.fontSize * 0.5));
}
