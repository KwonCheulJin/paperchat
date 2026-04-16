import { create } from "zustand";
import { toast } from "sonner";
import { chatStream, type Source, type ChatMessage } from "../lib/api";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  streaming?: boolean;
  createdAt: number;
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
  activeFolder: string | null;

  createSession: () => void;
  setActiveSession: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  editAndResend: (messageId: string, newContent: string) => void;
  stopStreaming: () => void;
  setProfile: (profile: string) => void;
  deleteSession: (id: string) => void;
  setActiveFolder: (folder: string | null) => void;
};

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  profile: "internal-general",
  isStreaming: false,
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
                { id: userMsgId, role: "user" as const, content, createdAt: Date.now() },
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

    try {
      for await (const event of chatStream(historyMessages, profile, sessionId, activeFolder, controller.signal)) {
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
