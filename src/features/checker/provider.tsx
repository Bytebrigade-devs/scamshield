"use client";

/**
 * M4 checker — the whole screen's state.
 *
 * One provider, one context, `useState` only (the house pattern from `features/vault`). The
 * state machine mirrors the vanilla screen exactly: the editor keeps its draft across views,
 * a submitted check is an immutable snapshot, and every user-visible failure keeps the text
 * the user typed.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { createSummaryModel } from "@/lib/scam-checker/ui/public/summary.js";

import { loadConfig as fetchConfig, loadHistory, postCheck } from "./http";
import type { ConfigResult } from "./http";
import { accessToken } from "./session";
import {
  HISTORY_LIMIT,
  SENDER_MAX,
  historyEntryFor,
  historyEntryFromServer,
  inputCap,
  isAnalysedOutcome,
  readHistory,
  summaryInstantFor,
  writeHistory,
  type CheckerConfig,
  type CheckerView,
  type HistoryEntry,
  type SubmittedCheck,
} from "./model";

export type FocusTarget = "textarea" | "sender" | "alert" | "heading";

export interface InputOptions {
  focus?: FocusTarget;
  fieldError?: string | null;
  senderError?: string | null;
  formError?: string | null;
}

interface CheckerContextValue {
  config: CheckerConfig | null;
  configLoading: boolean;
  text: string;
  sender: string;
  busy: boolean;
  view: CheckerView;
  history: HistoryEntry[];
  check: SubmittedCheck | null;
  fieldError: string | null;
  senderError: string | null;
  formError: string | null;
  /** Focus request; `nonce` makes two identical requests distinguishable. */
  focus: { target: FocusTarget; nonce: number } | null;
  printSummary: string;
  setText: (value: string) => void;
  setSender: (value: string) => void;
  setPrintSummary: (value: string) => void;
  dismissFieldError: () => void;
  dismissSenderError: () => void;
  submit: () => void;
  retryConfig: () => void;
  showInput: (options?: InputOptions) => void;
  showHistory: () => void;
  clearHistory: () => void;
  /** Whether a verified session is present (server history) vs the tab-session list. */
  signedIn: boolean;
  /** Cap in force right now (configured value, or the documented fallback). */
  cap: number;
}

const CheckerContext = createContext<CheckerContextValue | null>(null);

const CONNECT_FAILED = "We couldn’t reach the checking service or read its response. Your message is still here. Please try again.";
export const CONFIG_UNAVAILABLE_MESSAGE = "We couldn’t load the checking service. Try connecting again before submitting your message.";

export function CheckerProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<CheckerConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [text, setTextState] = useState("");
  const [sender, setSenderState] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<CheckerView>("input");
  // History lives in session storage, which does not exist during SSR. The server render reports
  // an empty list and the first client render renders the input screen, so the initializer cannot
  // cause a hydration mismatch.
  const [history, setHistory] = useState<HistoryEntry[]>(readHistory);
  // Signed-in callers read their retained server history; anonymous callers keep the tab-session
  // list. Resolved in an effect so the first client render matches the server render.
  const [signedIn, setSignedIn] = useState(false);
  const [check, setCheck] = useState<SubmittedCheck | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [senderError, setSenderError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ target: FocusTarget; nonce: number } | null>(null);
  const [printSummary, setPrintSummary] = useState("");
  const focusNonce = useRef(0);
  const configRequest = useRef<AbortController | null>(null);

  // History lives in session storage, which does not exist during SSR. Loading it in an
  // effect keeps the first client render identical to the server render.

  const requestFocus = useCallback((target: FocusTarget) => {
    focusNonce.current += 1;
    setFocus({ target, nonce: focusNonce.current });
  }, []);

  /** Apply one config response. Split out so the mount effect never sets state synchronously. */
  const applyConfig = useCallback((result: ConfigResult) => {
    setConfig(result.ok ? result.config : null);
    setConfigLoading(false);
    // A successful retry clears the stale "we couldn't connect" alert; a failed one leaves the
    // derived alert in place.
    if (result.ok) setFormError(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    configRequest.current = controller;
    void fetchConfig(controller.signal).then((result) => {
      if (!controller.signal.aborted) applyConfig(result);
    });
    return () => controller.abort();
  }, [applyConfig]);

  /** Replace the displayed list with the signed-in caller's retained server history. */
  const refreshServerHistory = useCallback(async () => {
    const result = await loadHistory();
    if (result.ok) setHistory(result.entries.map(historyEntryFromServer).slice(0, HISTORY_LIMIT));
  }, []);

  // Resolve the session once on mount: signed-in → server history; anonymous → tab-session list.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await accessToken();
      if (cancelled) return;
      setSignedIn(token !== null);
      if (token !== null) await refreshServerHistory();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshServerHistory]);

  const showInput = useCallback(
    (options: InputOptions = {}) => {
      setView("input");
      setPrintSummary("");
      setFieldError(options.fieldError ?? null);
      setSenderError(options.senderError ?? null);
      setFormError(options.formError ?? null);
      if (options.focus) requestFocus(options.focus);
    },
    [requestFocus],
  );

  const showHistory = useCallback(() => {
    setView("history");
    setPrintSummary("");
  }, []);

  const setText = useCallback((value: string) => {
    setTextState(value);
    setFieldError(null);
  }, []);

  const setSender = useCallback((value: string) => {
    setSenderState(value);
    setSenderError(null);
  }, []);

  const dismissFieldError = useCallback(() => setFieldError(null), []);
  const dismissSenderError = useCallback(() => setSenderError(null), []);

  const clearHistory = useCallback(() => {
    setHistory(writeHistory([]));
  }, []);

  const cap = inputCap(config);

  const submit = useCallback(() => {
    if (busy || config === null) return;
    if (sender.length > SENDER_MAX) {
      showInput({ focus: "sender", senderError: "Shorten sender information to 254 characters or fewer." });
      return;
    }
    const submittedText = text;
    if (submittedText.trim().length === 0 || submittedText.length > cap) {
      showInput({
        focus: "textarea",
        fieldError:
          submittedText.trim().length === 0
            ? "Paste a message before checking."
            : `Shorten your message to ${cap.toLocaleString("en-US")} characters or fewer.`,
      });
      return;
    }

    setBusy(true);
    setFormError(null);
    setFieldError(null);
    setSenderError(null);

    void postCheck(submittedText, sender.trim()).then((result) => {
      if (!result.ok) {
        setBusy(false);
        showInput({ focus: "alert", formError: CONNECT_FAILED });
        return;
      }
      const payload = result.payload;
      if (payload.outcome.kind === "rejected") {
        setBusy(false);
        const invalid = payload.outcome.reason === "invalid-input";
        showInput(
          invalid
            ? { focus: "textarea", fieldError: payload.outcome.message }
            : { focus: "alert", formError: payload.outcome.message },
        );
        return;
      }
      if (!isAnalysedOutcome(payload.outcome)) {
        setBusy(false);
        showInput({ focus: "alert", formError: CONNECT_FAILED });
        return;
      }

      // The snapshot is what the result view renders; later edits to the editor never reach it.
      const submitted: SubmittedCheck = {
        text: submittedText,
        payload,
        summary: createSummaryModel(payload, submittedText, summaryInstantFor(payload)),
      };
      if (signedIn) {
        // The server persisted the completed check under the verified subject; show the retained
        // account history rather than a local copy.
        void refreshServerHistory();
      } else {
        const entry = historyEntryFor(payload, submittedText, Date.now());
        setHistory((previous) => writeHistory([entry, ...previous].slice(0, HISTORY_LIMIT)));
      }
      setCheck(submitted);
      setBusy(false);
      setView("result");
      setPrintSummary("");
      requestFocus("heading");
    });
  }, [busy, cap, config, refreshServerHistory, requestFocus, sender, showInput, signedIn, text]);

  const retryConfig = useCallback(() => {
    setFieldError(null);
    setSenderError(null);
    setFormError(null);
    setConfigLoading(true);
    configRequest.current?.abort();
    const controller = new AbortController();
    configRequest.current = controller;
    void fetchConfig(controller.signal).then((result) => {
      if (!controller.signal.aborted) applyConfig(result);
    });
  }, [applyConfig]);

  const value = useMemo<CheckerContextValue>(
    () => ({
      config,
      configLoading,
      text,
      sender,
      busy,
      view,
      history,
      signedIn,
      check,
      fieldError,
      senderError,
      formError,
      focus,
      printSummary,
      setText,
      setSender,
      setPrintSummary,
      dismissFieldError,
      dismissSenderError,
      submit,
      retryConfig,
      showInput,
      showHistory,
      clearHistory,
      cap,
    }),
    [
      busy,
      cap,
      check,
      clearHistory,
      config,
      configLoading,
      dismissFieldError,
      dismissSenderError,
      fieldError,
      focus,
      formError,
      history,
      signedIn,
      printSummary,
      retryConfig,
      sender,
      senderError,
      setSender,
      setText,
      showHistory,
      showInput,
      submit,
      text,
      view,
    ],
  );

  return <CheckerContext.Provider value={value}>{children}</CheckerContext.Provider>;
}

export function useChecker(): CheckerContextValue {
  const context = useContext(CheckerContext);
  if (!context) throw new Error("CheckerProvider is missing");
  return context;
}
