"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Toast = { id: number; kind: "info" | "success" | "error"; message: string };
const Ctx = createContext<(message: string, kind?: Toast["kind"]) => void>(() => {});

/** Accessible toasts: announced via a polite live region; errors use role="alert". */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 4500);
  }, []);
  useEffect(() => {
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent<{ message: string; kind?: Toast["kind"] }>).detail;
      if (d?.message) push(d.message, d.kind);
    };
    window.addEventListener("app:toast", onEvt);
    return () => window.removeEventListener("app:toast", onEvt);
  }, [push]);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-kind={t.kind} role={t.kind === "error" ? "alert" : "status"}>
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
