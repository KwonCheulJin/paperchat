import { useEffect } from "react";
import { Toaster } from "sonner";
import ChatPage from "./features/chat/chat-page";
import SetupScreen from "./features/setup/setup-screen";
import { useSetupStore } from "./store/setup";

export default function App() {
  const { appStatus, initListeners } = useSetupStore();

  useEffect(() => {
    initListeners();
  }, [initListeners]);

  return (
    <>
      {appStatus === "ready" ? <ChatPage /> : <SetupScreen />}
      <Toaster position="top-right" richColors />
    </>
  );
}
