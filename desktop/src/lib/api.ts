// 백엔드 HTTP 클라이언트 모듈
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const BASE = "http://127.0.0.1:8000";

// SSE 이벤트 타입 정의
export type Source = {
  chunk_id: string;
  filename: string;
  text: string;
  score: number;
};

export type EntityItem = {
  value: string;
  context: string | null;
  doc_id: string;
  filename: string;
};

export type EntityMeta = {
  entityType: string;
  totalCount: number;
  hasMore: boolean;
  nextOffset: number;
  folder: string;
  docId: string | null;
};

export type SseEvent =
  | { type: "token"; content: string }
  | { type: "sources"; sources: Source[] }
  | { type: "done"; cached: boolean; status?: string; doc_id?: string; chunk_count?: number; filename?: string }
  | { type: "progress"; message: string }
  | { type: "error"; message: string }
  | { type: "tesseract_missing"; message: string }
  | {
      type: "entity_result";
      content: string;
      items: string[];
      entity_type: string;
      total_count: number;
      has_more: boolean;
      next_offset: number;
      folder: string;
      doc_id: string | null;
    };

export type DocumentInfo = {
  doc_id: string;
  filename: string;
  chunk_count: number;
  ingested_at: string;
  folder: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// SSE 스트림을 읽어 이벤트를 yield하는 공통 제너레이터
async function* readSseStream(res: Response): AsyncGenerator<SseEvent> {
  if (!res.body) {
    yield { type: "error", message: "응답 스트림을 읽을 수 없습니다" };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          yield data as SseEvent;
        } catch {
          // 파싱 실패 라인 무시
        }
      }
    }
  }
}

// POST /chat/stream — SSE 채팅 스트리밍
export async function* chatStream(
  messages: ChatMessage[],
  profile: string,
  sessionId?: string,
  folder?: string | null,
  signal?: AbortSignal,
  continuation?: { entity_type: string; folder: string; doc_id: string | null; offset: number },
): AsyncGenerator<SseEvent> {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, 300_000); // 5분 — CPU 환경에서 reranker + LLM TTFT 합산 시간 고려
  signal?.addEventListener("abort", () => {
    clearTimeout(timeoutTimer);
    timeoutController.abort();
  });

  try {
    // WebView2에서 POST가 간헐적으로 TypeError("Failed to fetch")로 터지는 케이스 존재 → 2회 재시도
    const MAX_ATTEMPTS = 3;
    let res: Response | undefined;
    let lastError: unknown;
    try {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        try {
          res = await fetch(`${BASE}/chat/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages, profile, session_id: sessionId, folder, continuation }),
            signal: timeoutController.signal,
          });
          break;
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") throw e;
          lastError = e;
          if (i < MAX_ATTEMPTS - 1) {
            await new Promise((r) => setTimeout(r, 500 + i * 1000));
          }
        }
      }
    } finally {
      clearTimeout(timeoutTimer);
    }

    if (!res) {
      const msg = lastError instanceof Error ? lastError.message : String(lastError);
      yield { type: "error", message: `연결 실패 — ${msg} (재시도 ${MAX_ATTEMPTS}회 실패)` };
      return;
    }

    if (!res.ok) {
      yield { type: "error", message: `HTTP ${res.status}: ${res.statusText}` };
      return;
    }

    yield* readSseStream(res);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      if (timedOut) {
        yield { type: "error", message: "응답 시간이 초과됐습니다. 다시 시도하거나 더 가벼운 모델을 선택하세요." };
      }
      // 사용자가 직접 중지한 경우 조용히 종료
      return;
    }
    throw e;
  }
}

// POST /documents/ingest — SSE 인제스트 스트리밍
// WebView2에서 POST FormData가 간헐적으로 TypeError("Failed to fetch")로 실패하는 케이스가 있어
// 최대 3회(즉시 → 500ms → 1500ms) 재시도한다. 백엔드가 실제로 4xx/5xx를 돌려준 경우엔 재시도하지 않음.
// 추가로 5분 idle 타임아웃을 두어 OCR/대용량 PDF 처리 중 무한 대기 방지.
// 백엔드는 SSE comment heartbeat(`: keepalive`)를 15s 마다 송출하므로 정상 처리 중에는 타임아웃 발생 안 함.
export async function* ingestPDF(file: File, folder: string = ""): AsyncGenerator<SseEvent> {
  const MAX_ATTEMPTS = 3;
  const TIMEOUT_MS = 300_000; // 5분 — OCR + 임베딩 합산 최악 시나리오 커버
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, TIMEOUT_MS);

  let res: Response | undefined;
  let lastError: unknown;

  try {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);
      try {
        res = await fetch(`${BASE}/documents/ingest`, {
          method: "POST",
          body: formData,
          signal: timeoutController.signal,
        });
        break;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          // 타임아웃으로 인한 abort 면 재시도하지 않고 즉시 종료.
          lastError = e;
          break;
        }
        lastError = e;
        if (i < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 500 + i * 1000));
        }
      }
    }
  } finally {
    // 응답 객체가 있으면 SSE 스트림 동안 타이머 살아 있어야 하므로 finally 에서 끄지 않는다.
    // 응답이 없으면(모두 실패) 즉시 끈다.
    if (!res) clearTimeout(timeoutTimer);
  }

  if (!res) {
    if (timedOut) {
      yield {
        type: "error",
        message: "처리가 너무 오래 걸려 중단됐습니다. 백엔드 로그를 확인하거나 더 작은 PDF로 다시 시도해 주세요.",
      };
    } else {
      const msg = lastError instanceof Error ? lastError.message : String(lastError);
      yield {
        type: "error",
        message: `백엔드에 연결할 수 없습니다 — ${msg} (재시도 ${MAX_ATTEMPTS}회 실패). 앱을 재시작하거나 backend.exe 가 실행 중인지 확인해 주세요.`,
      };
    }
    return;
  }

  if (!res.ok) {
    clearTimeout(timeoutTimer);
    yield { type: "error", message: `HTTP ${res.status}: ${res.statusText}` };
    return;
  }

  try {
    yield* readSseStream(res);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError" && timedOut) {
      yield {
        type: "error",
        message: "처리 도중 응답이 너무 오래 멈춰 중단됐습니다. 백엔드 로그를 확인해 주세요.",
      };
      return;
    }
    throw e;
  } finally {
    clearTimeout(timeoutTimer);
  }
}

// GET /documents/ — 문서 목록 조회
export async function listDocuments(): Promise<DocumentInfo[]> {
  const res = await fetch(`${BASE}/documents/`);
  if (!res.ok) throw new Error(`문서 목록 조회 실패: ${res.status}`);
  return res.json();
}

// DELETE /documents/{doc_id} — 문서 삭제
export async function deleteDocument(docId: string): Promise<void> {
  const res = await fetch(`${BASE}/documents/${docId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`문서 삭제 실패: ${res.status}`);
}

// Tauri: Tesseract 설치 여부 확인
export async function checkTesseract(): Promise<boolean> {
  return invoke<boolean>("check_tesseract");
}

// Tauri: Tesseract 자동 설치 (winget + tessdata 복사)
// onProgress: 설치 진행 콜백 (step, message)
// 설치 완료 또는 오류 시 resolve/reject
export async function installTesseract(
  onProgress?: (step: string, message: string) => void,
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let settled = false;

    const unlisten = await listen<{ step: string; message: string }>(
      "tesseract-install-progress",
      (event) => {
        if (settled) return;
        const { step, message } = event.payload;
        onProgress?.(step, message);
        if (step === "done") {
          settled = true;
          unlisten();
          resolve();
        } else if (step === "error") {
          settled = true;
          unlisten();
          reject(new Error(message));
        }
      },
    );

    invoke("install_tesseract").catch((e: unknown) => {
      if (!settled) {
        settled = true;
        unlisten();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

// POST /chat/feedback — 메시지 피드백
export async function submitFeedback(
  messageId: string,
  rating: "up" | "down",
  sessionId?: string | null,
): Promise<void> {
  await fetch(`${BASE}/chat/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id: messageId, rating, session_id: sessionId }),
  });
}
