// 백엔드 HTTP 클라이언트 모듈
const BASE = "http://127.0.0.1:8000";

// SSE 이벤트 타입 정의
export type Source = {
  chunk_id: string;
  filename: string;
  text: string;
  score: number;
};

export type SseEvent =
  | { type: "token"; content: string }
  | { type: "sources"; sources: Source[] }
  | { type: "done"; cached: boolean; status?: string; doc_id?: string; chunk_count?: number; filename?: string }
  | { type: "progress"; message: string }
  | { type: "error"; message: string };

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
  folder?: string | null,  // 활성 폴더 스코프 (선택)
  signal?: AbortSignal,  // 중지 신호
): AsyncGenerator<SseEvent> {
  try {
    // 연결 타임아웃 60초: llama-server 무응답 시 무한 대기 방지
    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(() => timeoutController.abort(), 60_000);
    // 사용자 중지(signal) 시 타임아웃도 같이 취소
    signal?.addEventListener("abort", () => {
      clearTimeout(timeoutTimer);
      timeoutController.abort();
    });

    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, profile, session_id: sessionId, folder }),
        signal: timeoutController.signal,  // 항상 타임아웃 신호 사용
      });
    } finally {
      clearTimeout(timeoutTimer);
    }

    if (!res.ok) {
      yield { type: "error", message: `HTTP ${res.status}: ${res.statusText}` };
      return;
    }

    yield* readSseStream(res);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return;  // 중지 요청 시 조용히 종료
    }
    throw e;
  }
}

// POST /documents/ingest — SSE 인제스트 스트리밍
export async function* ingestPDF(file: File, folder: string = ""): AsyncGenerator<SseEvent> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const res = await fetch(`${BASE}/documents/ingest`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    yield { type: "error", message: `HTTP ${res.status}: ${res.statusText}` };
    return;
  }

  yield* readSseStream(res);
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
