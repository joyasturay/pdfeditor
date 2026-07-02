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

/** Opaque white mask over original PDF text — sized generously so nothing bleeds through. */
export function drawTextMaskForBlocks(
  ctx: CanvasRenderingContext2D,
  blocks: PdfTextBlock[],
  displayText?: string
) {
  if (blocks.length === 0) return;

  ctx.save();
  ctx.fillStyle = "#ffffff";

  for (const block of blocks) {
    const coverWidth = Math.max(
      block.width,
      block.text.length * block.fontSize * 0.58,
      block.fontSize * 1.5
    );
    ctx.fillRect(
      block.x - 4,
      block.y - 4,
      coverWidth + 8,
      block.height + 8
    );
  }

  if (displayText) {
    const bounds = boundsFromBlocks(blocks);
    const fontSize = Math.max(...blocks.map((b) => b.fontSize));
    ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
    const measured = ctx.measureText(displayText).width;
    const coverWidth = Math.max(bounds.width, measured) + 8;
    ctx.fillRect(
      bounds.x - 4,
      bounds.y - 4,
      coverWidth,
      bounds.height + 8
    );
  }

  ctx.restore();
}

/** Draw committed text edits on canvas (masks original + draws new text). */
export function drawRegionEditsOnCanvas(
  ctx: CanvasRenderingContext2D,
  pageIndex: number,
  textBlocks: PdfTextBlock[],
  regionEdits: Record<string, string>
) {
  const pageTextBlocks = textBlocks.filter((b) => b.pageIndex === pageIndex);

  for (const [regionId, newText] of Object.entries(regionEdits)) {
    const blockIds = parseRegionBlockIds(regionId);
    const blocks = pageTextBlocks.filter((b) => blockIds.includes(b.id));
    if (blocks.length === 0) continue;

    const original = combineBlockTexts(blocks);
    if (newText === original) continue;

    drawTextMaskForBlocks(ctx, blocks, newText);

    const bounds = boundsFromBlocks(blocks);
    const fontSize = Math.max(...blocks.map((b) => b.fontSize));
    ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = "#000000";
    ctx.fillText(
      newText,
      bounds.x,
      blockTextBaseline({ ...blocks[0], y: bounds.y, fontSize })
    );
  }
}

/** Mask original PDF text while the user is actively editing a region. */
export function drawEditingMaskOnCanvas(
  ctx: CanvasRenderingContext2D,
  blocks: PdfTextBlock[],
  displayText: string
) {
  drawTextMaskForBlocks(ctx, blocks, displayText);
}
