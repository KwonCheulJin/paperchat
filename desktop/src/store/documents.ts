import { create } from "zustand";
import { toast } from "sonner";
import {
  listDocuments,
  deleteDocument as apiDeleteDocument,
  ingestPDF,
  installTesseract,
  type DocumentInfo,
} from "../lib/api";

export type FolderProgress = {
  folderName: string;   // 폴더명 (단일 파일이면 파일명)
  total: number;        // 전체 파일 수
  done: number;         // 처리 완료 수 (성공 + 실패 모두 카운트)
  failed: number;       // 실패 수 (배지 표시용)
  currentFile: string;  // 현재 처리 중인 파일명
  currentStatus: string; // 백엔드 진행 메시지
  hasRetry: boolean;    // 실패 파일 재시도 가능 여부
  chunkDone: number;    // 현재 파일의 임베딩 완료 청크 수
  chunkTotal: number;   // 현재 파일의 전체 청크 수 (0이면 청크 정보 없음)
};

type DocumentsStore = {
  documents: DocumentInfo[];
  folderProgress: FolderProgress | null;

  loadDocuments: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  uploadFiles: (files: File[], folder: string) => Promise<void>;
  deleteDocument: (docId: string) => Promise<void>;
  retryFailedUploads: () => Promise<void>;
};

// 단일 파일 SSE 스트림 소비 (내부 헬퍼)
async function consumeIngestStream(
  file: File,
  folder: string,
  update: (updater: (fp: FolderProgress) => FolderProgress) => void,
): Promise<"success" | "failure" | "tesseract_missing"> {
  for await (const event of ingestPDF(file, folder)) {
    if (event.type === "progress") {
      const match = event.message.match(/\((\d+)\/(\d+)\s*청크\)/);
      if (match) {
        const chunkDone = parseInt(match[1], 10);
        const chunkTotal = parseInt(match[2], 10);
        update((fp) => ({ ...fp, currentFile: file.name, currentStatus: event.message, chunkDone, chunkTotal }));
      } else {
        update((fp) => ({ ...fp, currentFile: file.name, currentStatus: event.message }));
      }
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
    } else if (event.type === "tesseract_missing") {
      return "tesseract_missing";
    }
  }
  return "failure";
}

// 완료 타이머 (레이스 컨디션 방지용 클로저 변수)
let uploadTimerId: ReturnType<typeof setTimeout> | null = null;
// 실패 파일 재시도용 (File 객체는 zustand state에 직렬화 불가)
let lastFailedUpload: { files: File[]; folder: string } | null = null;

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
        hasRetry: false,
        chunkDone: 0,
        chunkTotal: 0,
      },
    });

    // folderProgress 내부만 갱신하는 헬퍼
    const update = (updater: (fp: FolderProgress) => FolderProgress) => {
      set((s) => {
        if (s.folderProgress === null) return {};
        return { folderProgress: updater(s.folderProgress) };
      });
    };

    let localFailed = 0;
    const failedFilesList: File[] = [];

    try {
    // 순차 업로드 — Promise.all 병렬 금지
      for (const file of files) {
        update((fp) => ({ ...fp, currentFile: file.name, currentStatus: "업로드 중...", chunkDone: 0, chunkTotal: 0 }));
        let result: "success" | "failure";
        try {
          const raw = await consumeIngestStream(file, folder, update);
          if (raw === "tesseract_missing") {
            // OCR 엔진 자동 설치 후 재시도 (1회)
            try {
              update((fp) => ({ ...fp, currentStatus: "OCR 엔진 설치 중..." }));
              await installTesseract((_step, message) => {
                update((fp) => ({ ...fp, currentStatus: `OCR 설치: ${message}` }));
              });
              update((fp) => ({ ...fp, currentStatus: "재처리 중..." }));
              const retryRaw = await consumeIngestStream(file, folder, update);
              result = retryRaw === "tesseract_missing" ? "failure" : retryRaw;
            } catch (e) {
              toast.error(`OCR 엔진 설치 실패: ${e instanceof Error ? e.message : String(e)}`);
              result = "failure";
            }
          } else {
            result = raw;
          }
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
        if (result === "failure") {
          localFailed++;
          failedFilesList.push(file);
        }
      }
    } finally {
      // 완료 후 문서 목록 갱신 (루프 내 N+1 대신 1번만 호출)
      try {
        const docs = await listDocuments();
        set({ documents: docs });
      } catch {
        // 목록 갱신 실패는 무시
      }
      const succeeded = files.length - localFailed;
      if (succeeded > 0) {
        toast.success(
          files.length === 1
            ? `'${folderName}' 업로드됐습니다`
            : localFailed === 0
            ? `${succeeded}개 파일 업로드됐습니다`
            : `${succeeded}개 파일 업로드됐습니다 (${localFailed}개 실패)`
        );
      }
      if (failedFilesList.length > 0) {
        lastFailedUpload = { files: failedFilesList, folder };
        update((fp) => ({ ...fp, hasRetry: true, currentStatus: `${localFailed}개 실패 — 재시도 가능` }));
      }
      // 실패 없으면 3초, 재시도 있으면 8초 후 초기화
      const delay = failedFilesList.length > 0 ? 8000 : 3000;
      uploadTimerId = setTimeout(() => {
        set({ folderProgress: null });
        uploadTimerId = null;
      }, delay);
    }
  },

  retryFailedUploads: async () => {
    if (!lastFailedUpload) return;
    const { files, folder } = lastFailedUpload;
    lastFailedUpload = null;
    await useDocumentsStore.getState().uploadFiles(files, folder);
  },

  deleteDocument: async (docId) => {
    const doc = useDocumentsStore.getState().documents.find((d) => d.doc_id === docId);

    // 낙관적 제거 — 5초 후 API 호출
    set((s) => ({ documents: s.documents.filter((d) => d.doc_id !== docId) }));

    let undone = false;
    const timer = setTimeout(async () => {
      if (undone) return;
      try {
        await apiDeleteDocument(docId);
      } catch (e) {
        if (doc) set((s) => ({ documents: [doc, ...s.documents] }));
        toast.error(`문서 삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, 5000);

    if (doc) {
      toast.success("문서가 삭제됐습니다", {
        action: {
          label: "실행 취소",
          onClick: () => {
            undone = true;
            clearTimeout(timer);
            set((s) => ({ documents: [doc, ...s.documents] }));
          },
        },
        duration: 5000,
      });
    }
  },
}));
