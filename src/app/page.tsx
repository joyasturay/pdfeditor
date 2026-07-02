"use client";

import { usePdfEditor } from "@/hooks/usePdfEditor";
import { UploadZone } from "@/components/pdf-editor/UploadZone";
import { PdfEditor } from "@/components/pdf-editor/PdfEditor";

export default function Home() {
  const editor = usePdfEditor();

  if (!editor.document) {
    return (
      <UploadZone
        onUpload={editor.loadFile}
        onMerge={editor.loadMultipleForMerge}
      />
    );
  }

  return <PdfEditor key={editor.editorSession} editor={editor} />;
}
