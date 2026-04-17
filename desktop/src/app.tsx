import { Toaster } from "sonner";
import ChatPage from "./features/chat/chat-page";
import SetupScreen from "./features/setup/setup-screen";
import { useModelState } from "./hooks/use-model-state";

export default function App() {
  const modelState = useModelState();

  return (
    <>
      {modelState.modelState === "ready" ? <ChatPage /> : <SetupScreen modelState={modelState} />}
      <Toaster position="top-right" richColors />
    </>
  );
}
