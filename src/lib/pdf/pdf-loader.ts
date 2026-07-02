"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

let workerInitialized = false;

async function initPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerInitialized) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    workerInitialized = true;
  }
  return pdfjs;
}

/** Load PDF via pdf.js — handles common owner-password / empty-password docs. */
export async function loadPdfDocument(
  bytes: Uint8Array
): Promise<PDFDocumentProxy> {
  const pdfjs = await initPdfJs();
  const data = bytes.slice();

  const passwords = ["", undefined] as const;
  let lastError: unknown;

  for (const password of passwords) {
    try {
      const task = pdfjs.getDocument({
        data,
        password: password as string | undefined,
        stopAtErrors: false,
      });
      return await task.promise;
    } catch (err) {
      lastError = err;
      const name = (err as { name?: string }).name;
      if (name !== "PasswordException") throw err;
    }
  }

  throw lastError ?? new Error("Could not open PDF");
}

export async function renderPageToCanvas(
  pdfDoc: PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scale: number,
  extraRotation = 0
): Promise<{ width: number; height: number }> {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const rotation = ((page.rotate ?? 0) + extraRotation) % 360;
  const viewport = page.getViewport({ scale, rotation });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get canvas context");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport,
    canvas,
  }).promise;

  return { width: viewport.width, height: viewport.height };
}

export async function getPageDimensions(
  pdfDoc: PDFDocumentProxy,
  pageIndex: number,
  scale = 1
): Promise<{ width: number; height: number }> {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  return { width: viewport.width, height: viewport.height };
}
