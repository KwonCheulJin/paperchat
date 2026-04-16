import { create } from "zustand";
import { toast } from "sonner";
import {
  listDocuments,
  deleteDocument as apiDeleteDocument,
  ingestPDF,
  type DocumentInfo,
} from "../lib/api";

export type FolderProgress = {
  folderName: string;   // 폴더명 (단일 파일이면 파일명)
  total: number;        // 전체 파일 수
  done: number;         // 처리 완료 수 (성공 + 실패 모두 카운트)
  failed: number;       // 실패 수 (배지 표시용)
  currentFile: string;  // 현재 처리 중인 파일명
  currentStatus: string; // 백엔드 진행 메시지
};

type DocumentsStore = {
  documents: DocumentInfo[];
  folderProgress: FolderProgress | null;

  loadDocuments: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  uploadFiles: (files: File[], folder: string) => Promise<void>;
  deleteDocument: (docId: string) => Promise<void>;
};

// 단일 파일 SSE 스트림 소비 (내부 헬퍼)
// update 콜백: currentFile/currentStatus 갱신만 담당
// 반환값: 성공 여부
async function consumeIngestStream(
  file: File,
  folder: string,
  update: (updater: (fp: FolderProgress) => FolderProgress) => void,
): Promise<"success" | "failure"> {
  for await (const event of ingestPDF(file, folder)) {
    if (event.type === "progress") {
      update((fp) => ({ ...fp, currentFile: file.name, currentStatus: event.message }));
    } else if (event.type === "done") {
      const statusMsg =
        event.status === "duplicate"
          ? `${file.name}: 이미 인덱싱된 문서`
          : `${file.name}: 인덱싱 완료`;
      update((fp) => ({ ...fp, currentStatus: statusMsg }));
      return "success";
    } else if (event.type === "error") {
      toast.error(`${file.name}: ${event.message}`);
      return "failure";
    }
  }
  return "failure";
}

// 완료 타이머 (레이스 컨디션 방지용 클로저 변수)
let uploadTimerId: ReturnType<typeof setTimeout> | null = null;

export const useDocumentsStore = create<DocumentsStore>((set) => ({
  documents: [],
  folderProgress: null,

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

    // 이전 완료 타이머 취소 (새 업로드 시작 시 레이스 컨디션 방지)
    if (uploadTimerId !== null) {
      clearTimeout(uploadTimerId);
      uploadTimerId = null;
    }

    // 단일 파일이면 파일명을, 폴더명이 없으면 폴더명을 폴백
    const folderName = folder || (files.length === 1 ? files[0].name : "업로드");

    set({
      folderProgress: {
        folderName,
        total: files.length,
        done: 0,
        failed: 0,
        currentFile: "",
        currentStatus: "준비 중...",
      },
    });

    // folderProgress 내부만 갱신하는 헬퍼
    const update = (updater: (fp: FolderProgress) => FolderProgress) => {
      set((s) => {
        if (s.folderProgress === null) return {};
        return { folderProgress: updater(s.folderProgress) };
      });
    };

    try {
      // 순차 업로드 — Promise.all 병렬 금지
      for (const file of files) {
        update((fp) => ({ ...fp, currentFile: file.name, currentStatus: "업로드 중..." }));
        let result: "success" | "failure";
        try {
          result = await consumeIngestStream(file, folder, update);
        } catch (e) {
          toast.error(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
          result = "failure";
        }
        // 성공/실패 모두 done 증가 (진행률 바 정확성 보장)
        update((fp) => ({
          ...fp,
          done: fp.done + 1,
          failed: result === "failure" ? fp.failed + 1 : fp.failed,
        }));
      }
    } finally {
      // 완료 후 문서 목록 갱신 (루프 내 N+1 대신 1번만 호출)
      try {
        const docs = await listDocuments();
        set({ documents: docs });
      } catch {
        // 목록 갱신 실패는 무시
      }
      // 3초 후 진행 상태 초기화
      uploadTimerId = setTimeout(() => {
        set({ folderProgress: null });
        uploadTimerId = null;
      }, 3000);
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
