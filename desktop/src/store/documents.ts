import { create } from "zustand";
import { toast } from "sonner";
import {
  listDocuments,
  deleteDocument as apiDeleteDocument,
  ingestPDF,
  type DocumentInfo,
} from "../lib/api";

type DocumentsStore = {
  documents: DocumentInfo[];
  uploadProgress: string | null;
  isUploading: boolean;

  loadDocuments: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  uploadFiles: (files: File[], folder: string) => Promise<void>;
  deleteDocument: (docId: string) => Promise<void>;
};

// 단일 파일 SSE 스트림 소비 (내부 헬퍼)
async function consumeIngestStream(
  file: File,
  folder: string,
  set: (partial: Partial<{ uploadProgress: string | null; documents: DocumentInfo[] }>) => void,
): Promise<void> {
  for await (const event of ingestPDF(file, folder)) {
    if (event.type === "progress") {
      set({ uploadProgress: `${file.name}: ${event.message}` });
    } else if (event.type === "done") {
      const statusMsg =
        event.status === "duplicate"
          ? `${file.name}: 이미 인덱싱된 문서`
          : `${file.name}: 인덱싱 완료`;
      set({ uploadProgress: statusMsg });
      try {
        const docs = await listDocuments();
        set({ documents: docs });
      } catch {
        // 목록 갱신 실패는 무시
      }
      return;
    } else if (event.type === "error") {
      toast.error(`${file.name}: ${event.message}`);
      return;
    }
  }
}

export const useDocumentsStore = create<DocumentsStore>((set) => ({
  documents: [],
  uploadProgress: null,
  isUploading: false,

  loadDocuments: async () => {
    try {
      const docs = await listDocuments();
      set({ documents: docs });
    } catch (e) {
      toast.error(`문서 목록 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  uploadFile: async (file) => {
    await useDocumentsStore.getState().uploadFiles([file], "");
  },

  uploadFiles: async (files, folder) => {
    if (files.length === 0) return;
    set({ isUploading: true, uploadProgress: "업로드 준비 중..." });
    try {
      // 순차 업로드 — Promise.all 병렬 금지
      // 파일별 try/catch: 한 파일 실패가 다음 파일 진행을 막지 않도록
      for (const file of files) {
        try {
          await consumeIngestStream(file, folder, (partial) => set(partial));
        } catch (e) {
          toast.error(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      set({ isUploading: false });
      setTimeout(() => set({ uploadProgress: null }), 3000);
    }
  },

  deleteDocument: async (docId) => {
    try {
      await apiDeleteDocument(docId);
      set((s) => ({
        documents: s.documents.filter((d) => d.doc_id !== docId),
      }));
    } catch (e) {
      toast.error(`문서 삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
}));
