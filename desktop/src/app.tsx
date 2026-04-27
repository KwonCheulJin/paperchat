import { Toaster } from "sonner";
import ChatPage from "./features/chat/chat-page";
import SetupScreen from "./features/setup/setup-screen";
import { useModelState } from "./hooks/use-model-state";
import { TooltipProvider } from "./shared/ui/tooltip";
import { ErrorMonitorBoundary } from "@kwoncheulJin/error-monitor";

export default function App() {
  const modelState = useModelState();

  return (
    <ErrorMonitorBoundary>
      <TooltipProvider delayDuration={200}>
        {modelState.modelState === "ready" ? <ChatPage /> : <SetupScreen modelState={modelState} />}
        <Toaster position="top-right" richColors />
      </TooltipProvider>
    </ErrorMonitorBoundary>
  );
}
