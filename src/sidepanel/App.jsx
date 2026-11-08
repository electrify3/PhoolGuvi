import { useState, useEffect, useCallback } from "react";
import Header from "./components/Header";
import TabNav from "./components/TabNav";
import AutoSolverPanel from "./components/AutoSolverPanel";
import CodeKataPanel from "./components/CodeKataPanel";

const TABS = [
  { id: "autosolver", label: "Auto Solver", icon: "🚀" },
  { id: "codekata", label: "CodeKata", icon: "📋" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("autosolver");
  const [engineState, setEngineState] = useState({
    isRunning: false,
    instantBypass: true,
    speed: 16,
    lesson: "",
    status: "Ready",
    log: [],
    pageType: null, // "courses-video" | "codekata" | null
    editorReady: false,
    courseComplete: false,
  });

  // Listen for state updates from content scripts via background
  useEffect(() => {
    const listener = (msg) => {
      if (msg.type === "STATE_UPDATE") {
        setEngineState((prev) => ({ ...prev, ...msg.payload }));
      }
      if (msg.type === "LOG_APPEND") {
        setEngineState((prev) => ({
          ...prev,
          log: [...prev.log.slice(-49), { text: msg.text, time: Date.now() }],
        }));
      }
      if (msg.type === "PAGE_DETECTED") {
        setEngineState((prev) => ({ ...prev, pageType: msg.pageType }));
        // Auto-switch tab based on page type
        if (msg.pageType === "codekata") setActiveTab("codekata");
        else if (msg.pageType === "courses-video") setActiveTab("autosolver");
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    // Request current state on mount
    chrome.runtime.sendMessage({ type: "GET_STATE" });

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const sendCommand = useCallback((command, value) => {
    chrome.runtime.sendMessage({ type: "COMMAND", command, value });
  }, []);

  return (
    <div className="app">
      <Header pageType={engineState.pageType} />
      <TabNav tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="tab-content">
        {activeTab === "autosolver" && (
          <AutoSolverPanel state={engineState} onCommand={sendCommand} />
        )}
        {activeTab === "codekata" && (
          <CodeKataPanel state={engineState} onCommand={sendCommand} />
        )}
      </div>
    </div>
  );
}
