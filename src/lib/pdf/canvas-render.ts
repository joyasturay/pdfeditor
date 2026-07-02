import type { Annotation, PdfTextBlock } from "./types";
import { blockTextBaseline } from "./types";
import {
  boundsFromBlocks,
  combineBlockTexts,
  parseRegionBlockIds,
} from "./text-regions";

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
 * Bake committed text edits onto a canvas.
 * Used exclusively for export — editor preview uses React div layer instead.
 */
export function drawRegionEditsOnCanvas(
  ctx: CanvasRenderingContext2D,
  pageIndex: number,
  textBlocks: PdfTextBlock[],
  regionEdits: Record<string, string>,
  skipRegionId?: string | null
) {
  const pageTextBlocks = textBlocks.filter((b) => b.pageIndex === pageIndex);

  for (const [regionId, newText] of Object.entries(regionEdits)) {
    if (skipRegionId && regionId === skipRegionId) continue;

    const blockIds = parseRegionBlockIds(regionId);
    const blocks = pageTextBlocks.filter((b) => blockIds.includes(b.id));
    if (blocks.length === 0) continue;

    const original = combineBlockTexts(blocks);
    if (newText === original) continue;

    const bounds = boundsFromBlocks(blocks);
    const fontSize = Math.max(...blocks.map((b) => b.fontSize));

    // Measure actual rendered text width so cover is exactly right
    ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
    const measured = ctx.measureText(newText).width;
    const coverWidth = Math.max(bounds.width, measured) + 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(bounds.x - 1, bounds.y - 1, coverWidth + 2, bounds.height + 2);

    ctx.fillStyle = "#000000";
    // Use the first block as the baseline reference
    const baselineY = blockTextBaseline({ ...blocks[0], y: bounds.y, fontSize });
    ctx.fillText(newText, bounds.x, baselineY);
  }
}
