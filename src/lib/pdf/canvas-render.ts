import type { Annotation, PdfTextBlock } from "./types";
import { combineBlockTexts, parseRegionBlockIds } from "./text-regions";

export function drawAnnotationOnCanvas(
  ctx: CanvasRenderingContext2D,
  ann: Annotation
) {
  ctx.save();

  switch (ann.type) {
    case "text": {
      ctx.font = `${ann.fontSize ?? 16}px sans-serif`;
      ctx.fillStyle = ann.color;
      ctx.fillText(ann.text ?? "", ann.x, ann.y + (ann.fontSize ?? 16));
      break;
    }
    case "highlight": {
      ctx.fillStyle = ann.color + "66";
      ctx.fillRect(ann.x, ann.y, ann.width ?? 0, ann.height ?? 0);
      break;
    }
    case "rectangle": {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.strokeWidth ?? 2;
      ctx.strokeRect(ann.x, ann.y, ann.width ?? 0, ann.height ?? 0);
      break;
    }
    case "circle": {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.strokeWidth ?? 2;
      ctx.beginPath();
      ctx.ellipse(
        ann.x + (ann.width ?? 0) / 2,
        ann.y + (ann.height ?? 0) / 2,
        Math.abs(ann.width ?? 0) / 2,
        Math.abs(ann.height ?? 0) / 2,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      break;
    }
    case "line": {
      if (!ann.points || ann.points.length < 2) break;
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.strokeWidth ?? 2;
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      ctx.lineTo(ann.points[1].x, ann.points[1].y);
      ctx.stroke();
      break;
    }
    case "draw": {
      if (!ann.points || ann.points.length < 2) break;
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.strokeWidth ?? 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i].x, ann.points[i].y);
      }
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

/**
 * Cover all committed text edits on the canvas.
 *
 * @param editingRegionId  If set, white-out that region but skip drawing new text
 *                         (the live textarea handles display while editing).
 */
export function drawRegionEditsOnCanvas(
  ctx: CanvasRenderingContext2D,
  pageIndex: number,
  textBlocks: PdfTextBlock[],
  regionEdits: Record<string, string>,
  editingRegionId?: string | null
) {
  const pageTextBlocks = textBlocks.filter((b) => b.pageIndex === pageIndex);

  for (const [regionId, newText] of Object.entries(regionEdits)) {
    const blockIds = parseRegionBlockIds(regionId);
    const blocks = pageTextBlocks.filter((b) => blockIds.includes(b.id));
    if (blocks.length === 0) continue;

    const original = combineBlockTexts(blocks);
    if (newText === original) continue;

    // Raw block bounds for the white cover — trust pdf.js measurements.
    const bx = Math.min(...blocks.map((b) => b.x));
    const by = Math.min(...blocks.map((b) => b.y));
    const right = Math.max(...blocks.map((b) => b.x + b.width));
    const bottom = Math.max(...blocks.map((b) => b.y + b.height));
    const fontSize = Math.max(...blocks.map((b) => b.fontSize));

    // White out original text with 1px padding on each side.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(bx - 1, by - 1, right - bx + 2, bottom - by + 2);

    // While editing this region: leave blank — the textarea shows the live value.
    if (regionId === editingRegionId) continue;

    // Draw replacement text at the same baseline as original.
    ctx.save();
    ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = "#000000";
    ctx.fillText(newText, bx, by + fontSize * 0.85);
    ctx.restore();
  }
}

/** White out a region without drawing replacement (used while user is actively editing). */
export function whiteOutRegionBlocks(
  ctx: CanvasRenderingContext2D,
  blocks: PdfTextBlock[]
) {
  if (blocks.length === 0) return;
  const bx = Math.min(...blocks.map((b) => b.x));
  const by = Math.min(...blocks.map((b) => b.y));
  const right = Math.max(...blocks.map((b) => b.x + b.width));
  const bottom = Math.max(...blocks.map((b) => b.y + b.height));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(bx - 2, by - 2, right - bx + 4, bottom - by + 4);
}
