import { v4 as uuidv4 } from "uuid";
import type { PdfTextBlock } from "./types";

export interface TextEditRegion {
  id: string;
  pageIndex: number;
  blockIds: string[];
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function regionIdForBlocks(blockIds: string[]) {
  return `region:${[...blockIds].sort().join("|")}`;
}

export function parseRegionBlockIds(regionId: string): string[] {
  if (regionId.startsWith("region:")) {
    const ids = regionId.slice(7);
    return ids ? ids.split("|") : [];
  }
  // legacy
  return regionId.replace(/^region-/, "").split("_");
}

export function combineBlockTexts(blocks: PdfTextBlock[]): string {
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  let result = "";
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    const prev = sorted[i - 1];
    if (i > 0 && prev) {
      const gap = b.x - (prev.x + prev.width);
      if (gap > b.fontSize * 0.15) result += " ";
    }
    result += b.text;
  }
  return result;
}

export function boundsFromBlocks(blocks: PdfTextBlock[]): Rect {
  const x = Math.min(...blocks.map((b) => b.x));
  const y = Math.min(...blocks.map((b) => b.y));
  const right = Math.max(...blocks.map((b) => b.x + b.width));
  const bottom = Math.max(...blocks.map((b) => b.y + b.height));
  const fontSize = Math.max(...blocks.map((b) => b.fontSize));
  return {
    x,
    y,
    width: Math.max(right - x, fontSize * 0.5),
    height: Math.max(bottom - y, fontSize * 1.1),
  };
}

export function regionFromBlocks(blocks: PdfTextBlock[]): TextEditRegion | null {
  if (blocks.length === 0) return null;
  const blockIds = blocks.map((b) => b.id);
  const bounds = boundsFromBlocks(blocks);
  return {
    id: regionIdForBlocks(blockIds),
    pageIndex: blocks[0].pageIndex,
    blockIds,
    text: combineBlockTexts(blocks),
    ...bounds,
    fontSize: Math.max(...blocks.map((b) => b.fontSize)),
  };
}

export function sameLine(a: PdfTextBlock, b: PdfTextBlock) {
  return Math.abs(a.y - b.y) < Math.max(a.fontSize, b.fontSize) * 0.55;
}

export function getLineBlocks(
  blocks: PdfTextBlock[],
  pageIndex: number,
  seed: PdfTextBlock
): PdfTextBlock[] {
  const pageBlocks = blocks.filter((b) => b.pageIndex === pageIndex);
  return pageBlocks
    .filter((b) => sameLine(b, seed))
    .sort((a, b) => a.x - b.x);
}

export function hitTestBlock(
  blocks: PdfTextBlock[],
  pageIndex: number,
  x: number,
  y: number
): PdfTextBlock | null {
  const pageBlocks = blocks.filter((b) => b.pageIndex === pageIndex);
  for (let i = pageBlocks.length - 1; i >= 0; i--) {
    const b = pageBlocks[i];
    const pad = 4;
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

function gapBetween(a: PdfTextBlock, b: PdfTextBlock) {
  return b.x - (a.x + a.width);
}

/**
 * Split a text line into table cells / field groups using gap analysis.
 * Word gaps within a cell are small (~0.3–1.2× fontSize).
 * Table column gaps are much larger (~2×+ fontSize).
 */
export function splitLineIntoCells(line: PdfTextBlock[]): PdfTextBlock[][] {
  if (line.length <= 1) return [line];

  const sorted = [...line].sort((a, b) => a.x - b.x);
  const fontSize = Math.max(...sorted.map((b) => b.fontSize));
  const gaps = sorted.slice(1).map((b, i) => gapBetween(sorted[i], b));

  if (gaps.length === 0) return [sorted];

  const minGap = Math.min(...gaps);
  const maxGap = Math.max(...gaps);

  // All items are close together — one cell (e.g. "JOYASTU RAY")
  if (maxGap <= fontSize * 1.35) {
    return [sorted];
  }

  // Adaptive threshold: split where gap exceeds typical word spacing
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? fontSize;
  const columnThreshold = Math.max(
    fontSize * 1.35,
    minGap * 2.5,
    medianGap * 0.85
  );

  const cells: PdfTextBlock[][] = [];
  let cell: PdfTextBlock[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = gapBetween(sorted[i - 1], sorted[i]);
    if (gap > columnThreshold) {
      cells.push(cell);
      cell = [sorted[i]];
    } else {
      cell.push(sorted[i]);
    }
  }
  cells.push(cell);

  return cells;
}

export function getCellBlocksAtPoint(
  blocks: PdfTextBlock[],
  pageIndex: number,
  x: number,
  y: number
): PdfTextBlock[] {
  const hit = hitTestBlock(blocks, pageIndex, x, y);
  if (!hit) return [];

  const line = getLineBlocks(blocks, pageIndex, hit);
  const cells = splitLineIntoCells(line);

  for (const cell of cells) {
    if (cell.some((b) => b.id === hit.id)) return cell;
  }

  return [hit];
}

export function getFieldRegionAtPoint(
  blocks: PdfTextBlock[],
  pageIndex: number,
  x: number,
  y: number
): TextEditRegion | null {
  const cellBlocks = getCellBlocksAtPoint(blocks, pageIndex, x, y);
  if (cellBlocks.length === 0) return null;
  return regionFromBlocks(cellBlocks);
}

/** @deprecated Use getFieldRegionAtPoint — kept for compatibility */
export function getFieldBlocksAtPoint(
  blocks: PdfTextBlock[],
  pageIndex: number,
  x: number,
  y: number
): PdfTextBlock[] {
  return getCellBlocksAtPoint(blocks, pageIndex, x, y);
}

export function getLineRegionAtPoint(
  blocks: PdfTextBlock[],
  pageIndex: number,
  x: number,
  y: number
): TextEditRegion | null {
  return getFieldRegionAtPoint(blocks, pageIndex, x, y);
}

function rectsIntersect(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function getBlocksInRect(
  blocks: PdfTextBlock[],
  pageIndex: number,
  rect: Rect
): PdfTextBlock[] {
  return blocks
    .filter((b) => b.pageIndex === pageIndex)
    .filter((b) =>
      rectsIntersect(rect, {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
      })
    )
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function getRegionInRect(
  blocks: PdfTextBlock[],
  pageIndex: number,
  rect: Rect
): PdfTextBlock[] {
  const selected = getBlocksInRect(blocks, pageIndex, rect);
  if (selected.length === 0) return [];

  // Group selected blocks by line, then pick cells that intersect the rect
  const lines: PdfTextBlock[][] = [];
  for (const block of selected) {
    const line = lines.find((group) => sameLine(group[0], block));
    if (line) line.push(block);
    else lines.push([block]);
  }

  const result: PdfTextBlock[] = [];
  for (const line of lines) {
    const cells = splitLineIntoCells(line);
    for (const cell of cells) {
      const cellBounds = boundsFromBlocks(cell);
      if (rectsIntersect(rect, cellBounds)) {
        result.push(...cell);
      }
    }
  }

  return result.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function getRegionFromRect(
  blocks: PdfTextBlock[],
  pageIndex: number,
  rect: Rect
): TextEditRegion | null {
  const selected = getRegionInRect(blocks, pageIndex, rect);
  if (selected.length === 0) return null;
  return regionFromBlocks(selected);
}

export function normalizeDragRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/** Merge raw pdf.js items into one block per table cell / field. */
export function mergeExtractedLines(blocks: PdfTextBlock[]): PdfTextBlock[] {
  if (blocks.length === 0) return [];
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfTextBlock[][] = [];

  for (const block of sorted) {
    const line = lines.find((group) => sameLine(group[0], block));
    if (line) line.push(block);
    else lines.push([block]);
  }

  const merged: PdfTextBlock[] = [];
  for (const line of lines) {
    const cells = splitLineIntoCells(line);
    for (const cell of cells) {
      const r = regionFromBlocks(cell);
      if (r) merged.push({ ...r, id: uuidv4() });
    }
  }

  return merged;
}
