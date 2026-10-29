"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  PROGRESS_KEY,
  HANDOFF_KEY,
  REFERRAL_KEY,
  EXPERIMENT_KEY,
  TTL,
  newProgress,
  decodeProgress,
  makeHandoff,
  safeReferral,
  safeSignupPath,
  type Progress,
} from "@/lib/model";
import { emitEvent } from "@/lib/events";
type State = {
  progress: Progress;
  ready: boolean;
  storageError: boolean;
  invalid: string;
  variant: "A" | "B";
  referral: string | null;
  handoffError: string;
  save: (p: Progress) => void;
  restart: () => void;
  retry: () => void;
  handoff: () => void;
  clear: () => void;
};
const Context = createContext<State | null>(null);
export function JourneyProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>(newProgress);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [invalid, setInvalid] = useState("");
  const [variant, setVariant] = useState<"A" | "B">("A");
  const [referral, setReferral] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState("");
  useEffect(() => {
    try {
      const result = decodeProgress(localStorage.getItem(PROGRESS_KEY));
      if (result.kind === "valid") setProgress(result.progress!);
      else if (result.kind === "invalid")
        setInvalid(
          "Your saved progress could not be read. Start again to continue safely.",
        );
      else if (result.kind === "expired") {
        localStorage.removeItem(PROGRESS_KEY);
        setInvalid(
          "Your saved progress has expired after seven days. Start a fresh introduction.",
        );
      }
      const now = Date.now();
      const incoming = safeReferral(
        new URLSearchParams(location.search).get("ref"),
      );
      if (incoming) {
        localStorage.setItem(
          REFERRAL_KEY,
          JSON.stringify({ code: incoming, expiresAt: now + TTL }),
        );
        setReferral(incoming);
        emitEvent("referral_visit", { referral: true });
      } else {
        try {
          const r = JSON.parse(localStorage.getItem(REFERRAL_KEY) || "null");
          if (
            r &&
            r.expiresAt > now &&
            r.expiresAt <= now + TTL &&
            safeReferral(r.code)
          )
            setReferral(r.code);
          else localStorage.removeItem(REFERRAL_KEY);
        } catch {
          localStorage.removeItem(REFERRAL_KEY);
        }
      }
      if (process.env.NEXT_PUBLIC_AB_ENABLED === "true") {
        let a: { variant?: "A" | "B"; expiresAt?: number } = {};
        try {
          a = JSON.parse(localStorage.getItem(EXPERIMENT_KEY) || "{}") || {};
        } catch {
          /* Reassign malformed experiment state. */
        }
        const validAssignment =
          (a.variant === "A" || a.variant === "B") &&
          typeof a.expiresAt === "number" &&
          a.expiresAt > now &&
          a.expiresAt <= now + TTL;
        const v =
          validAssignment && a.variant
            ? a.variant
            : crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0
              ? "A"
              : "B";
        if (!validAssignment)
          localStorage.setItem(
            EXPERIMENT_KEY,
            JSON.stringify({ variant: v, expiresAt: now + TTL }),
          );
        setVariant(v);
        emitEvent("experiment_exposure", { variant: v });
      }
    } catch {
      setStorageError(true);
    }
    setReady(true);
  }, []);
  const save = useCallback((p: Progress) => {
    const now = Date.now();
    const next = { ...p, updatedAt: now, expiresAt: now + TTL };
    setProgress(next);
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, []);
  const clear = useCallback(() => {
    setProgress(newProgress());
    setInvalid("");
    setReferral(null);
    setVariant("A");
    setHandoffError("");
    try {
      [
        PROGRESS_KEY,
        HANDOFF_KEY,
        REFERRAL_KEY,
        EXPERIMENT_KEY,
        "scamshield.m1.share-code",
      ].forEach((k) => localStorage.removeItem(k));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, []);
  const restart = useCallback(() => {
    setInvalid("");
    setHandoffError("");
    try {
      localStorage.removeItem(HANDOFF_KEY);
    } catch {
      /* save will report any persistence error. */
    }
    save(newProgress());
  }, [save]);
  const handoff = () => {
    try {
      const context = makeHandoff(progress, referral);
      localStorage.setItem(HANDOFF_KEY, JSON.stringify(context));
      setHandoffError("");
      emitEvent("signup_handoff_clicked");
      router.push(safeSignupPath(process.env.NEXT_PUBLIC_SIGNUP_PATH));
    } catch {
      setHandoffError(
        "We couldn’t prepare your signup context. Your answers are still here. Please allow browser storage and try again.",
      );
    }
  };
  return (
    <Context.Provider
      value={{
        progress,
        ready,
        storageError,
        invalid,
        variant,
        referral,
        handoffError,
        save,
        restart,
        retry: () => save(progress),
        handoff,
        clear,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useJourney() {
  const value = useContext(Context);
  if (!value) throw new Error("JourneyProvider is required");
  return value;
}
