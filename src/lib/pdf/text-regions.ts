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

function blockCenterX(block: PdfTextBlock) {
  return block.x + block.width / 2;
}

function gapBetween(a: PdfTextBlock, b: PdfTextBlock) {
  return b.x - (a.x + a.width);
}

function median(values: number[]) {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Detect table columns by clustering text x-positions across the whole page.
 * Labels ("Date of Birth") and values ("28-08-2005") land in different columns
 * even when the horizontal gap between them is small.
 */
export function assignColumnIndices(blocks: PdfTextBlock[]): PdfTextBlock[] {
  if (blocks.length === 0) return [];

  const fontSize = median(blocks.map((b) => b.fontSize));
  const clusterThreshold = fontSize * 1.8;

  const sorted = [...blocks].sort((a, b) => blockCenterX(a) - blockCenterX(b));
  const clusters: { centerX: number; blocks: PdfTextBlock[] }[] = [];

  for (const block of sorted) {
    const cx = blockCenterX(block);
    let bestCluster: (typeof clusters)[number] | null = null;
    let bestDist = Infinity;

    for (const cluster of clusters) {
      const dist = Math.abs(cx - cluster.centerX);
      if (dist < clusterThreshold && dist < bestDist) {
        bestDist = dist;
        bestCluster = cluster;
      }
    }

    if (bestCluster) {
      bestCluster.blocks.push(block);
      const count = bestCluster.blocks.length;
      bestCluster.centerX =
        (bestCluster.centerX * (count - 1) + cx) / count;
    } else {
      clusters.push({ centerX: cx, blocks: [block] });
    }
  }

  clusters.sort((a, b) => a.centerX - b.centerX);

  return blocks.map((block) => {
    const cx = blockCenterX(block);
    let columnIndex = 0;
    let bestDist = Infinity;
    clusters.forEach((cluster, idx) => {
      const dist = Math.abs(cx - cluster.centerX);
      if (dist < bestDist) {
        bestDist = dist;
        columnIndex = idx;
      }
    });
    return { ...block, columnIndex };
  });
}

export function getLineBlocks(
  blocks: PdfTextBlock[],
  pageIndex: number,
  seed: PdfTextBlock
): PdfTextBlock[] {
  return blocks
    .filter((b) => b.pageIndex === pageIndex)
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

/** Merge adjacent words within the same table cell (same line + column). */
function mergeWordsInCell(blocks: PdfTextBlock[]): PdfTextBlock[] {
  if (blocks.length <= 1) return blocks;

  const sorted = [...blocks].sort((a, b) => a.x - b.x);
  const merged: PdfTextBlock[] = [];
  let group: PdfTextBlock[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = group[group.length - 1];
    const curr = sorted[i];
    const gap = gapBetween(prev, curr);
    const fs = Math.max(prev.fontSize, curr.fontSize);

    if (gap <= fs * 1.2) {
      group.push(curr);
    } else {
      if (group.length === 1) merged.push(group[0]);
      else {
        const r = regionFromBlocks(group);
        if (r) merged.push({ ...r, id: uuidv4(), columnIndex: prev.columnIndex });
      }
      group = [curr];
    }
  }

  if (group.length === 1) merged.push(group[0]);
  else {
    const r = regionFromBlocks(group);
    if (r) merged.push({ ...r, id: uuidv4(), columnIndex: group[0].columnIndex });
  }

  return merged;
}

/** True for form/schedule rows — edit one cell at a time. False for titles/headers — edit full line. */
export function isTableDataRow(line: PdfTextBlock[]): boolean {
  const cols = new Set(line.map((b) => b.columnIndex ?? 0));
  if (cols.size < 2) return false;

  // Schedule rows (Date | Time | Time | Time)
  if (cols.size >= 3) return true;

  const leftCol = Math.min(...cols);
  const leftText = line
    .filter((b) => (b.columnIndex ?? 0) === leftCol)
    .map((b) => b.text)
    .join(" ");

  const labelPattern =
    /\b(Number|Name|Birth|Venue|Date|Time|Roll|Timing|Reporting|Closure|Test|Exam|Candidate|Registration)\b/i;
  return labelPattern.test(leftText);
}

/** Get blocks to edit at click point — full line for titles, single cell for table rows. */
export function getEditBlocksAtPoint(
  blocks: PdfTextBlock[],
  pageIndex: number,
  x: number,
  y: number
): PdfTextBlock[] {
  const hit = hitTestBlock(blocks, pageIndex, x, y);
  if (!hit) return [];

  const line = getLineBlocks(blocks, pageIndex, hit);

  if (isTableDataRow(line)) {
    const columnIndex = hit.columnIndex ?? 0;
    return line.filter((b) => (b.columnIndex ?? 0) === columnIndex);
  }

  return line;
}

/** Get all blocks in the same table cell as the clicked point. */
export function getCellBlocksAtPoint(
  blocks: PdfTextBlock[],
  pageIndex: number,
  x: number,
  y: number
): PdfTextBlock[] {
  return getEditBlocksAtPoint(blocks, pageIndex, x, y);
}

export function getFieldRegionAtPoint(
  blocks: PdfTextBlock[],
  pageIndex: number,
  x: number,
  y: number
): TextEditRegion | null {
  const editBlocks = getEditBlocksAtPoint(blocks, pageIndex, x, y);
  if (editBlocks.length === 0) return null;
  return regionFromBlocks(editBlocks);
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
      rectsIntersect(rect, { x: b.x, y: b.y, width: b.width, height: b.height })
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

  const result: PdfTextBlock[] = [];
  const seen = new Set<string>();

  for (const block of selected) {
    const columnIndex = block.columnIndex ?? 0;
    const line = getLineBlocks(blocks, pageIndex, block);
    const cellBlocks = line.filter((b) => (b.columnIndex ?? 0) === columnIndex);

    for (const b of cellBlocks) {
      if (!seen.has(b.id) && rectsIntersect(rect, boundsFromBlocks([b]))) {
        seen.add(b.id);
        result.push(b);
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

/** Build one editable block per table cell. */
export function mergeExtractedLines(blocks: PdfTextBlock[]): PdfTextBlock[] {
  if (blocks.length === 0) return [];

  const withColumns = assignColumnIndices(blocks);
  const lines: PdfTextBlock[][] = [];

  for (const block of withColumns) {
    const line = lines.find((group) => sameLine(group[0], block));
    if (line) line.push(block);
    else lines.push([block]);
  }

  const merged: PdfTextBlock[] = [];
  for (const line of lines) {
    if (isTableDataRow(line)) {
      const columns = new Map<number, PdfTextBlock[]>();
      for (const block of line) {
        const col = block.columnIndex ?? 0;
        const group = columns.get(col) ?? [];
        group.push(block);
        columns.set(col, group);
      }

      for (const cellBlocks of columns.values()) {
        const words = mergeWordsInCell(cellBlocks);
        merged.push(...words);
      }
    } else {
      const words = mergeWordsInCell(line);
      if (words.length === 1) merged.push(words[0]);
      else {
        const r = regionFromBlocks(line);
        if (r) merged.push({ ...r, id: uuidv4() });
      }
    }
  }

  return merged;
}
