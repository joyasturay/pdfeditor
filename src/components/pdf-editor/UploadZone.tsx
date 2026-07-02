"use client";

import { useCallback, useRef } from "react";
import { FileUp, Files } from "lucide-react";

interface UploadZoneProps {
  onUpload: (file: File) => void;
  onMerge: (files: File[]) => void;
}

export function UploadZone({ onUpload, onMerge }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mergeRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const pdfs = files.filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      if (pdfs.length === 1) onUpload(pdfs[0]);
      else if (pdfs.length > 1) onMerge(pdfs);
    },
    [onUpload, onMerge]
  );

  return (
    <div
      className="flex min-h-[70vh] flex-col items-center justify-center px-6"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="w-full max-w-2xl rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-12 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950">
          <FileUp className="h-10 w-10 text-blue-600" />
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">PDF Studio</h1>
        <p className="mb-8 text-zinc-500">
          Upload a PDF to edit, annotate, merge, split, rotate, and export — all in your browser.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700"
          >
            <FileUp className="h-5 w-5" />
            Upload PDF
          </button>
          <button
            type="button"
            onClick={() => mergeRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-6 py-3 font-medium transition hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            <Files className="h-5 w-5" />
            Merge PDFs
          </button>
        </div>

        <p className="mt-6 text-sm text-zinc-400">
          or drag and drop PDF files here
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <input
        ref={mergeRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onMerge(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
