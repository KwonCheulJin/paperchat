import { create } from "zustand";
import { toast } from "sonner";
import { chatStream, type Source, type ChatMessage } from "../lib/api";
import type { ProfileValue } from "../shared/profiles";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  streaming?: boolean;
  interrupted?: boolean;
  createdAt: number;
};

export type Session = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
};

export type StreamingPhase = null | "fetching" | "generating";

type ChatStore = {
  sessions: Session[];
  activeSessionId: string | null;
  profile: ProfileValue;
  isStreaming: boolean;
  streamingPhase: StreamingPhase;
  abortController: AbortController | null;
  activeFolder: string | null;

  createSession: () => void;
  setActiveSession: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  editAndResend: (messageId: string, newContent: string) => void;
  stopStreaming: () => void;
  setProfile: (profile: ProfileValue) => void;
  deleteSession: (id: string) => void;
  setActiveFolder: (folder: string | null) => void;
};

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  profile: "internal-general",
  isStreaming: false,
  streamingPhase: null,
  abortController: null,
  activeFolder: null,

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
    const { activeSessionId, profile, activeFolder } = get();

    let sessionId = activeSessionId;
    if (!sessionId) {
      const id = genId();
      const session: Session = {
        id,
        title: [...content].slice(0, 20).join("") || "새 대화",
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
              title: sess.messages.length === 0 ? [...content].slice(0, 20).join("") || "새 대화" : sess.title,
              messages: [
                ...sess.messages,
                { id: userMsgId, role: "user" as const, content, createdAt: Date.now() },
              ],
            }
          : sess
      ),
    }));

    set((s) => ({
      isStreaming: true,
      streamingPhase: "fetching",
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? {
              ...sess,
              messages: [
                ...sess.messages,
                { id: assistantMsgId, role: "assistant" as const, content: "", streaming: true, createdAt: Date.now() },
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

    const removeFailedMessages = () => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId
            ? {
                ...sess,
                messages: sess.messages.filter(
                  (m) => m.id !== assistantMsgId && m.id !== userMsgId
                ),
              }
            : sess
        ),
      }));
    };

    let sseError = false;

    try {
      for await (const event of chatStream(historyMessages, profile, sessionId, activeFolder, controller.signal)) {
        if (!get().isStreaming) break;

        if (event.type === "sources") {
          set((s) => ({
            streamingPhase: "generating",
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
        } else if (event.type === "error") {
          sseError = true;
          removeFailedMessages();
          toast.error(event.message);
          break;
        } else if (event.type === "done") {
          break;
        }
      }
    } catch (e) {
      if (!sseError) {
        removeFailedMessages();
        toast.error("연결 오류가 발생했습니다. 다시 시도해 주세요.");
      }
      throw e;
    } finally {
      set((s) => ({
        isStreaming: false,
        streamingPhase: null,
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

    if (sseError) throw new Error("SSE error");
  },

  stopStreaming: () => {
    const { abortController, activeSessionId, sessions } = get();
    abortController?.abort();
    const session = sessions.find((s) => s.id === activeSessionId);
    const streamingMsg = session?.messages.find((m) => m.streaming && m.role === "assistant");
    if (streamingMsg) {
      set((s) => ({
        isStreaming: false,
        abortController: null,
        sessions: s.sessions.map((sess) =>
          sess.id === activeSessionId
            ? { ...sess, messages: sess.messages.map((m) => m.id === streamingMsg.id ? { ...m, interrupted: true } : m) }
            : sess
        ),
      }));
      toast("응답이 중단되었습니다", { duration: 3000 });
    } else {
      set({ isStreaming: false, abortController: null });
    }
  },

  setProfile: (profile) => set({ profile }),

  deleteSession: (id) => {
    const sessions = get().sessions;
    const index = sessions.findIndex((s) => s.id === id);
    const session = sessions[index];
    set((s) => {
      const remaining = s.sessions.filter((sess) => sess.id !== id);
      return {
        sessions: remaining,
        activeSessionId:
          s.activeSessionId === id
            ? remaining[0]?.id ?? null
            : s.activeSessionId,
      };
    });
    if (session) {
      toast.success("대화가 삭제됐습니다", {
        action: {
          label: "실행 취소",
          onClick: () =>
            set((s) => {
              const next = [...s.sessions];
              const clampedIdx = Math.min(index, next.length);
              next.splice(clampedIdx, 0, session);
              return { sessions: next };
            }),
        },
        duration: 5000,
      });
    }
  },

  editAndResend: (messageId, newContent) => {
    const { sessions, activeSessionId, sendMessage } = get();
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const messageIndex = session.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === activeSessionId
          ? { ...sess, messages: sess.messages.slice(0, messageIndex) }
          : sess
      ),
    }));
    sendMessage(newContent);
  },

  setActiveFolder: (folder) => set({ activeFolder: folder }),
}));
