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

function samplePdfBackground(
  pdfCtx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number }
) {
  const cx = Math.min(
    Math.max(0, Math.round(bounds.x + bounds.width / 2)),
    pdfCtx.canvas.width - 1
  );
  const cy = Math.min(
    Math.max(0, Math.round(bounds.y + bounds.height / 2)),
    pdfCtx.canvas.height - 1
  );
  const [r, g, b] = pdfCtx.getImageData(cx, cy, 1, 1).data;
  return `rgb(${r},${g},${b})`;
}

/**
 * Paint over original PDF text using the sampled background color from the PDF
 * canvas — so grey table cells stay grey instead of getting a white sticker.
 */
export function drawTextMaskForBlocks(
  pdfCtx: CanvasRenderingContext2D,
  overlayCtx: CanvasRenderingContext2D,
  blocks: PdfTextBlock[],
  displayText?: string
) {
  if (blocks.length === 0) return;

  const bounds = boundsFromBlocks(blocks);
  const fontSize = Math.max(...blocks.map((b) => b.fontSize));

  overlayCtx.save();
  overlayCtx.fillStyle = samplePdfBackground(pdfCtx, bounds);

  const blockRight = Math.max(
    ...blocks.map((b) => b.x + Math.max(b.width, b.text.length * b.fontSize * 0.65))
  );

  let coverRight = blockRight;
  if (displayText) {
    overlayCtx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
    coverRight = Math.max(
      coverRight,
      bounds.x + overlayCtx.measureText(displayText).width + 6
    );
  }

  overlayCtx.fillRect(
    bounds.x - 6,
    bounds.y - 6,
    coverRight - bounds.x + 12,
    bounds.height + 12
  );

  overlayCtx.restore();
}

/** Draw committed text edits (background-matched mask + new text). */
export function drawRegionEditsOnCanvas(
  pdfCtx: CanvasRenderingContext2D,
  overlayCtx: CanvasRenderingContext2D,
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

    drawTextMaskForBlocks(pdfCtx, overlayCtx, blocks, newText);

    const bounds = boundsFromBlocks(blocks);
    const fontSize = Math.max(...blocks.map((b) => b.fontSize));
    overlayCtx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
    overlayCtx.fillStyle = "#000000";
    overlayCtx.fillText(
      newText,
      bounds.x,
      blockTextBaseline({ ...blocks[0], y: bounds.y, fontSize })
    );
  }
}

export function drawEditingMaskOnCanvas(
  pdfCtx: CanvasRenderingContext2D,
  overlayCtx: CanvasRenderingContext2D,
  blocks: PdfTextBlock[],
  displayText: string
) {
  drawTextMaskForBlocks(pdfCtx, overlayCtx, blocks, displayText);
}
