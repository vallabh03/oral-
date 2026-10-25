"use client";
import { useCallback, useRef, useState } from "react";

type Opts = { title: string; body: string; confirmLabel: string; danger?: boolean };

/**
 * Confirmation modal for sensitive or irreversible actions (FR-PUB-13). Uses the native
 * <dialog>: focus moves into the modal, Escape cancels, and focus returns to the trigger.
 */
export function useConfirm() {
  const ref = useRef<HTMLDialogElement>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});
  const opener = useRef<HTMLElement | null>(null);
  const [opts, setOpts] = useState<Opts | null>(null);

  const confirm = useCallback((o: Opts) => {
    opener.current = document.activeElement as HTMLElement;
    setOpts(o);
    requestAnimationFrame(() => ref.current?.showModal());
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);

  const finish = (v: boolean) => {
    ref.current?.close();
    resolver.current(v);
  };

  const dialog = (
    <dialog ref={ref} aria-labelledby="confirm-title" aria-describedby="confirm-body" onCancel={() => resolver.current(false)} onClose={() => opener.current?.focus()}>
      {opts && (
        <>
          <div className="dialog-body">
            <h2 id="confirm-title" style={{ fontSize: "var(--step-2)" }}>{opts.title}</h2>
            <p id="confirm-body">{opts.body}</p>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => finish(false)} autoFocus>Cancel</button>
            <button type="button" className={`btn ${opts.danger ? "btn-danger" : "btn-primary"}`} onClick={() => finish(true)}>{opts.confirmLabel}</button>
          </div>
        </>
      )}
    </dialog>
  );
  return { confirm, dialog };
}
