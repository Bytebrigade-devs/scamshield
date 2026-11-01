"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  DEMO_KEY,
  decodeDemo,
  allConfirmed,
  commitDemo,
  type PracticeId,
  type SafetySummary,
} from "./model";
import { makeSummary, type Scenario } from "./fixtures";
import { fetchSummary, SummaryError } from "./service";
type Mode = "demo" | "integration";
type State = {
  ready: boolean;
  mode: Mode;
  setMode: (mode: Mode) => void;
  checked: PracticeId[];
  setChecked: (ids: PracticeId[]) => void;
  savedAt: string | null;
  persisted: boolean;
  storageError: string;
  saveChecklist: () => boolean;
  previewUnsaved: () => void;
  reset: () => void;
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
  summary: SafetySummary | null;
  status: "idle" | "loading" | "ready" | "error";
  problem: { kind: string; message: string } | null;
  reload: () => void;
  now: number;
  configured: boolean;
};
const Context = createContext<State | null>(null);
const apiPath = process.env.NEXT_PUBLIC_M6_API_PATH || "";
export function SafetyProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [mode, updateMode] = useState<Mode>(apiPath ? "integration" : "demo");
  const [checked, setChecked] = useState<PracticeId[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [scenario, updateScenario] = useState<Scenario>("missing");
  const [summary, setSummary] = useState<SafetySummary | null>(null);
  const [status, setStatus] = useState<State["status"]>("idle");
  const [problem, setProblem] = useState<State["problem"]>(null);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now);
  const sourcesRoute = pathname.startsWith("/safety-score/sources");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const result = decodeDemo(sessionStorage.getItem(DEMO_KEY));
        if (result.kind === "valid") {
          setChecked(result.record!.checked);
          setSavedAt(result.record!.savedAt);
          setPersisted(true);
        } else if (result.kind === "invalid")
          setStorageError(
            "Saved demonstration data could not be read. Reset the demo to clear it.",
          );
      } catch {
        setStorageError(
          "Browser session storage is unavailable. You can explore, but saving the checklist may fail.",
        );
      }
      setReady(true);
    });
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  function prepareLoad() {
    setStatus("loading");
    setProblem(null);
    setSummary(null);
  }
  function setMode(value: Mode) {
    if (value === mode) return;
    if (value === "integration") prepareLoad();
    updateMode(value);
  }
  function setScenario(value: Scenario) {
    if (value === scenario) return;
    prepareLoad();
    updateScenario(value);
  }
  function reload() {
    prepareLoad();
    setRevision((value) => value + 1);
  }
  useEffect(() => {
    if (mode !== "integration" && !sourcesRoute) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const timer = setTimeout(
      async () => {
        setStatus("loading");
        setProblem(null);
        setSummary(null);
        try {
          if (
            !apiPath &&
            ["error", "signed-out", "forbidden"].includes(scenario)
          )
            throw new SummaryError(
              scenario === "signed-out"
                ? "auth"
                : scenario === "forbidden"
                  ? "forbidden"
                  : "network",
              scenario === "signed-out"
                ? "Sign in through Module 2 to view a personal summary."
                : scenario === "forbidden"
                  ? "This demonstration session cannot access that summary."
                  : "The summary service is unavailable in this simulated error state.",
            );
          const data = apiPath
            ? await fetchSummary(apiPath, controller.signal)
            : makeSummary(scenario);
          if (active) {
            setSummary(data);
            setNow(Date.now());
            setStatus("ready");
          }
        } catch (error) {
          if (active) {
            setProblem({
              kind: error instanceof SummaryError ? error.kind : "network",
              message:
                error instanceof SummaryError
                  ? error.message
                  : "The summary could not be loaded. Please try again.",
            });
            setStatus("error");
          }
        } finally {
          clearTimeout(timeout);
        }
      },
      apiPath ? 0 : 350,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [mode, sourcesRoute, scenario, revision]);
  function saveChecklist() {
    if (!allConfirmed(checked)) {
      setStorageError("Review and confirm all five practices before saving.");
      return false;
    }
    try {
      const record = commitDemo(sessionStorage, checked);
      setSavedAt(record.savedAt);
      setPersisted(true);
      setStorageError("");
      return true;
    } catch {
      setStorageError(
        "We couldn’t save the checklist in this browser session. Your choices remain here. Retry or preview the result without saving.",
      );
      return false;
    }
  }
  function previewUnsaved() {
    if (allConfirmed(checked)) {
      setSavedAt(new Date().toISOString());
      setPersisted(false);
    }
  }
  function reset() {
    setChecked([]);
    setSavedAt(null);
    setPersisted(false);
    try {
      sessionStorage.removeItem(DEMO_KEY);
      setStorageError("");
    } catch {
      setStorageError(
        "This view has been reset, but stored data could not be cleared. It may return after a refresh.",
      );
    }
  }
  return (
    <Context.Provider
      value={{
        ready,
        mode,
        setMode,
        checked,
        setChecked,
        savedAt,
        persisted,
        storageError,
        saveChecklist,
        previewUnsaved,
        reset,
        scenario,
        setScenario,
        summary,
        status,
        problem,
        reload,
        now,
        configured: !!apiPath,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSafety() {
  const state = useContext(Context);
  if (!state) throw new Error("SafetyProvider is required.");
  return state;
}
