export type Tool =
  | "select"
  | "editText"
  | "text"
  | "draw"
  | "highlight"
  | "rectangle"
  | "circle"
  | "line"
  | "eraser";

export type TextEditSubMode = "click" | "marquee";

export interface Point {
  x: number;
  y: number;
}

export interface PdfTextBlock {
  id: string;
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export function blockTextBaseline(block: PdfTextBlock) {
  return block.y + block.fontSize * 0.85;
}

export interface Annotation {
  id: string;
  pageIndex: number;
  type: Exclude<Tool, "select" | "eraser">;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Point[];
  text?: string;
  color: string;
  fontSize?: number;
  strokeWidth?: number;
}

export interface PdfDocumentState {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

export const DEFAULT_COLOR = "#2563eb";
export const HIGHLIGHT_COLOR = "#facc15";
export const DEFAULT_FONT_SIZE = 16;
export const DEFAULT_STROKE_WIDTH = 2;

export const TOOL_LABELS: Record<Tool, string> = {
  select: "Select",
  editText: "Edit PDF Text",
  text: "Add Text",
  draw: "Draw",
  highlight: "Highlight",
  rectangle: "Rectangle",
  circle: "Circle",
  line: "Line",
  eraser: "Eraser",
};
