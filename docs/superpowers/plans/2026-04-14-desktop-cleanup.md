# Desktop Cleanup & Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `project/` 폴더 삭제, `desktop/src` 파일명 kebab-case 통일, 에러 처리를 sonner toast로 교체, Claude 테마 적용.

**Architecture:** 독립적인 4개 태스크를 순서대로 실행. 각 태스크는 독립적으로 커밋 가능. `desktop`은 Vite + React + Zustand + Tailwind v3 스택이며 shadcn 미초기화 상태.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Zustand 5, Tailwind CSS v3, sonner

---

### Task 1: `project/` 폴더 삭제

**Files:**
- Delete: `project/` (전체)

- [ ] **Step 1: `project/` 폴더 삭제**

```bash
cd D:/projects/local-llm-service
rm -rf project/
```

- [ ] **Step 2: 삭제 스테이징 및 커밋**

```bash
git add -A
git commit -m "chore: project/ 폴더 삭제 (desktop + backend으로 대체)"
```

Expected: `project/` 디렉토리가 사라지고 커밋 완료.

---

### Task 2: `desktop/src` 파일명 kebab-case 변경

**Files:**
- Rename: `desktop/src/App.tsx` → `desktop/src/app.tsx`
- Rename: `desktop/src/features/chat/ChatPage.tsx` → `desktop/src/features/chat/chat-page.tsx`
- Rename: `desktop/src/features/chat/InputBar.tsx` → `desktop/src/features/chat/input-bar.tsx`
- Rename: `desktop/src/features/chat/MessageList.tsx` → `desktop/src/features/chat/message-list.tsx`
- Rename: `desktop/src/features/chat/ProfileSelector.tsx` → `desktop/src/features/chat/profile-selector.tsx`
- Rename: `desktop/src/features/chat/SessionSidebar.tsx` → `desktop/src/features/chat/session-sidebar.tsx`
- Rename: `desktop/src/features/documents/DocumentPanel.tsx` → `desktop/src/features/documents/document-panel.tsx`
- Modify: `desktop/src/main.tsx`
- Modify: `desktop/src/app.tsx`
- Modify: `desktop/src/features/chat/chat-page.tsx`

> Windows의 case-insensitive 파일시스템에서 git이 대소문자만 다른 rename을 추적하려면 두 단계 rename이 필요하다.

- [ ] **Step 1: 파일 이름 변경 (git mv 두 단계)**

```bash
cd D:/projects/local-llm-service

git mv desktop/src/App.tsx desktop/src/App_tmp.tsx
git mv desktop/src/App_tmp.tsx desktop/src/app.tsx

git mv desktop/src/features/chat/ChatPage.tsx desktop/src/features/chat/ChatPage_tmp.tsx
git mv desktop/src/features/chat/ChatPage_tmp.tsx desktop/src/features/chat/chat-page.tsx

git mv desktop/src/features/chat/InputBar.tsx desktop/src/features/chat/InputBar_tmp.tsx
git mv desktop/src/features/chat/InputBar_tmp.tsx desktop/src/features/chat/input-bar.tsx

git mv desktop/src/features/chat/MessageList.tsx desktop/src/features/chat/MessageList_tmp.tsx
git mv desktop/src/features/chat/MessageList_tmp.tsx desktop/src/features/chat/message-list.tsx

git mv desktop/src/features/chat/ProfileSelector.tsx desktop/src/features/chat/ProfileSelector_tmp.tsx
git mv desktop/src/features/chat/ProfileSelector_tmp.tsx desktop/src/features/chat/profile-selector.tsx

git mv desktop/src/features/chat/SessionSidebar.tsx desktop/src/features/chat/SessionSidebar_tmp.tsx
git mv desktop/src/features/chat/SessionSidebar_tmp.tsx desktop/src/features/chat/session-sidebar.tsx

git mv desktop/src/features/documents/DocumentPanel.tsx desktop/src/features/documents/DocumentPanel_tmp.tsx
git mv desktop/src/features/documents/DocumentPanel_tmp.tsx desktop/src/features/documents/document-panel.tsx
```

- [ ] **Step 2: `main.tsx` import 업데이트**

`desktop/src/main.tsx` 전체 내용:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 3: `app.tsx` import 업데이트**

`desktop/src/app.tsx` 전체 내용:
```tsx
import ChatPage from "./features/chat/chat-page";

export default function App() {
  return <ChatPage />;
}
```

- [ ] **Step 4: `chat-page.tsx` import 업데이트**

`desktop/src/features/chat/chat-page.tsx`에서 import 경로 5개 변경 (함수 바디는 그대로):
```tsx
import { useState } from "react";
import SessionSidebar from "./session-sidebar";
import MessageList from "./message-list";
import InputBar from "./input-bar";
import ProfileSelector from "./profile-selector";
import DocumentPanel from "../documents/document-panel";
```

- [ ] **Step 5: 빌드 확인**

```bash
cd D:/projects/local-llm-service/desktop
pnpm build
```

Expected: 오류 없이 `dist/` 생성.

- [ ] **Step 6: 커밋**

```bash
cd D:/projects/local-llm-service
git add desktop/src/
git commit -m "refactor: desktop/src 파일명 kebab-case로 통일"
```

---

### Task 3: 에러 처리 → sonner toast

**Files:**
- Modify: `desktop/src/store/chat.ts`
- Modify: `desktop/src/store/documents.ts`
- Modify: `desktop/src/app.tsx`
- Modify: `desktop/src/features/documents/document-panel.tsx`

- [ ] **Step 1: sonner 설치**

```bash
cd D:/projects/local-llm-service/desktop
pnpm add sonner
```

Expected: `sonner` 가 `package.json` dependencies에 추가됨.

- [ ] **Step 2: `app.tsx`에 `<Toaster />` 마운트**

`desktop/src/app.tsx` 전체 내용:
```tsx
import ChatPage from "./features/chat/chat-page";
import { Toaster } from "sonner";

export default function App() {
  return (
    <>
      <ChatPage />
      <Toaster position="top-right" richColors />
    </>
  );
}
```

- [ ] **Step 3: `store/chat.ts` 에러 처리 변경**

에러 발생 시: 빈 assistant 버블 제거 + `toast.error()`. 파일 상단에 import 추가 및 error 블록, catch 블록 변경.

`desktop/src/store/chat.ts` 전체 내용:
```ts
import { create } from "zustand";
import { toast } from "sonner";
import { chatStream, type Source, type ChatMessage } from "../lib/api";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  streaming?: boolean;
};

export type Session = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
};

type ChatStore = {
  sessions: Session[];
  activeSessionId: string | null;
  profile: string;
  isStreaming: boolean;
  abortController: AbortController | null;

  createSession: () => void;
  setActiveSession: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  setProfile: (profile: string) => void;
  deleteSession: (id: string) => void;
};

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  profile: "internal-general",
  isStreaming: false,
  abortController: null,

  createSession: () => {
    const id = genId();
    const session: Session = {
      id,
      title: "새 대화",
      messages: [],
      createdAt: Date.now(),
    };
    set((s) => ({
      sessions: [session, ...s.sessions],
      activeSessionId: id,
    }));
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  sendMessage: async (content) => {
    const { activeSessionId, profile } = get();

    let sessionId = activeSessionId;
    if (!sessionId) {
      const id = genId();
      const session: Session = {
        id,
        title: content.slice(0, 20) || "새 대화",
        messages: [],
        createdAt: Date.now(),
      };
      set((s) => ({
        sessions: [session, ...s.sessions],
        activeSessionId: id,
      }));
      sessionId = id;
    }

    const userMsgId = genId();
    const assistantMsgId = genId();

    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? {
              ...sess,
              title: sess.messages.length === 0 ? content.slice(0, 20) || "새 대화" : sess.title,
              messages: [
                ...sess.messages,
                { id: userMsgId, role: "user" as const, content },
              ],
            }
          : sess
      ),
    }));

    set((s) => ({
      isStreaming: true,
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? {
              ...sess,
              messages: [
                ...sess.messages,
                { id: assistantMsgId, role: "assistant" as const, content: "", streaming: true },
              ],
            }
          : sess
      ),
    }));

    const currentSession = get().sessions.find((s) => s.id === sessionId);
    const historyMessages: ChatMessage[] = (currentSession?.messages ?? [])
      .filter((m) => !m.streaming && m.id !== assistantMsgId)
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    set({ abortController: controller });

    try {
      for await (const event of chatStream(historyMessages, profile, sessionId, controller.signal)) {
        if (!get().isStreaming) break;

        if (event.type === "sources") {
          set((s) => ({
            sessions: s.sessions.map((sess) =>
              sess.id === sessionId
                ? {
                    ...sess,
                    messages: sess.messages.map((m) =>
                      m.id === assistantMsgId ? { ...m, sources: event.sources } : m
                    ),
                  }
                : sess
            ),
          }));
        } else if (event.type === "token") {
          set((s) => ({
            sessions: s.sessions.map((sess) =>
              sess.id === sessionId
                ? {
                    ...sess,
                    messages: sess.messages.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: m.content + event.content }
                        : m
                    ),
                  }
                : sess
            ),
          }));
        } else if (event.type === "done" || event.type === "error") {
          if (event.type === "error") {
            // 빈 assistant 버블 제거
            set((s) => ({
              sessions: s.sessions.map((sess) =>
                sess.id === sessionId
                  ? {
                      ...sess,
                      messages: sess.messages.filter((m) => m.id !== assistantMsgId),
                    }
                  : sess
              ),
            }));
            toast.error(event.message);
          }
          break;
        }
      }
    } catch (e) {
      toast.error(`채팅 오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      set((s) => ({
        isStreaming: false,
        abortController: null,
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId
            ? {
                ...sess,
                messages: sess.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, streaming: false } : m
                ),
              }
            : sess
        ),
      }));
    }
  },

  stopStreaming: () => {
    const { abortController } = get();
    abortController?.abort();
    set({ isStreaming: false, abortController: null });
  },

  setProfile: (profile) => set({ profile }),

  deleteSession: (id) =>
    set((s) => {
      const remaining = s.sessions.filter((sess) => sess.id !== id);
      return {
        sessions: remaining,
        activeSessionId:
          s.activeSessionId === id
            ? remaining[0]?.id ?? null
            : s.activeSessionId,
      };
    }),
}));
```

- [ ] **Step 4: `store/documents.ts` 에러 처리 변경**

`desktop/src/store/documents.ts` 전체 내용:
```ts
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
  deleteDocument: (docId: string) => Promise<void>;
};

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
    set({ isUploading: true, uploadProgress: "업로드 준비 중..." });
    try {
      for await (const event of ingestPDF(file)) {
        if (event.type === "progress") {
          set({ uploadProgress: event.message });
        } else if (event.type === "done") {
          const statusMsg =
            event.status === "duplicate" ? "이미 인덱싱된 문서입니다." : "인덱싱 완료";
          set({ uploadProgress: statusMsg });
          try {
            const docs = await listDocuments();
            set({ documents: docs });
          } catch {
            // 목록 갱신 실패는 무시
          }
          break;
        } else if (event.type === "error") {
          toast.error(event.message);
          set({ uploadProgress: null });
          break;
        }
      }
    } catch (e) {
      toast.error(`업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
      set({ uploadProgress: null });
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
```

- [ ] **Step 5: `document-panel.tsx` 하단 오류 메시지 블록 제거**

`uploadProgress`는 이제 진행/완료 메시지만 담으므로, 업로드 완료 후 표시하던 별도 블록을 제거한다.

`desktop/src/features/documents/document-panel.tsx`에서 아래 블록을 삭제:
```tsx
{/* 삭제할 블록: 업로드 완료/오류 메시지 */}
{!isUploading && uploadProgress && (
  <p className="text-xs text-muted-foreground mt-2 text-center">{uploadProgress}</p>
)}
```

- [ ] **Step 6: 빌드 확인**

```bash
cd D:/projects/local-llm-service/desktop
pnpm build
```

Expected: 오류 없이 빌드 완료.

- [ ] **Step 7: 커밋**

```bash
cd D:/projects/local-llm-service
git add desktop/
git commit -m "feat: 에러 처리를 sonner toast로 교체"
```

---

### Task 4: Claude 테마 적용

**Files:**
- Modify: `desktop/src/styles/globals.css`

- [ ] **Step 1: Claude 테마 설치**

```bash
cd D:/projects/local-llm-service/desktop
pnpm dlx shadcn@latest add https://tweakcn.com/r/themes/claude.json
```

shadcn 초기화 프롬프트가 뜨면 다음으로 응답:
- Which style? → **Default**
- Which base color? → **Slate** (덮어씌워지므로 무관)
- Use CSS variables? → **Yes**
- Where is your `tailwind.config.js`? → `tailwind.config.js`
- Where are your components? → `src/components`
- Where is your utils file? → `src/lib/utils`

> 프롬프트 없이 바로 `globals.css`만 업데이트될 수도 있음 (기존 shadcn-compatible 구조 감지 시).

- [ ] **Step 2: `globals.css` 변경 확인**

`desktop/src/styles/globals.css`를 열어 `--background`, `--primary` 등 CSS 변수가 Claude 테마 값으로 변경됐는지 확인. 파일 경로가 다르게 생성됐을 경우 (`src/index.css` 등) 내용을 `desktop/src/styles/globals.css`에 병합하고 새로 생성된 파일은 삭제.

- [ ] **Step 3: 빌드 확인**

```bash
cd D:/projects/local-llm-service/desktop
pnpm build
```

Expected: 오류 없이 빌드 완료.

- [ ] **Step 4: 커밋**

```bash
cd D:/projects/local-llm-service
git add desktop/
git commit -m "feat: Claude 테마 적용 (tweakcn)"
```
