"use client";
import { useMemo, useRef, useState } from "react";
import { visibleQuestions, validateAnswers, type Answers, type Question } from "@/lib/shared/protocol";
import { newKey, postJson, type ApiError } from "./api";
import { useToast } from "./Toaster";
import { useLang } from "./i18n";

type Props = { endpoint: string; initial?: Answers; onCompleted: () => void };

export function Questionnaire({ endpoint, initial = {}, onCompleted }: Props) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "submit">("");
  const key = useRef(newKey());
  const summary = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const questions = useMemo(() => visibleQuestions(answers), [answers]);
  const { t, dir, lang } = useLang();

  const setSingle = (q: Question, v: string) => setAnswers((a) => ({ ...a, [q.id]: v }));
  const toggleMulti = (q: Question & { type: "multi" }, v: string) =>
    setAnswers((a) => {
      const cur = new Set((a[q.id] as string[] | undefined) ?? []);
      if (cur.has(v)) cur.delete(v);
      else if (q.exclusive === v) return { ...a, [q.id]: [v] };
      else {
        if (q.exclusive) cur.delete(q.exclusive);
        cur.add(v);
      }
      return { ...a, [q.id]: [...cur] };
    });

  const send = async (complete: boolean) => {
    const v = validateAnswers(answers, { requireComplete: complete });
    if (!v.ok) {
      setErrors(v.errors);
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    setErrors({});
    setBusy(complete ? "submit" : "save");
    try {
      await postJson(endpoint, { answers: v.answers, complete, idempotencyKey: complete ? key.current : newKey() });
      if (complete) onCompleted();
      else toast(t("Progress saved. You can finish later with your resume link."), "success");
    } catch (e) {
      const err = e as ApiError;
      if (err.fields) setErrors(err.fields);
      toast(err.message, "error");
    } finally {
      setBusy("");
    }
  };

  const errList = Object.entries(errors);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void send(true); }} noValidate dir={dir} lang={lang}>
      {errList.length > 0 && (
        <div className="error-summary" ref={summary} tabIndex={-1} role="alert">
          <h2>{errList.length === 1 ? t("Please answer this question") : t("Please answer these {count} questions", { count: errList.length })}</h2>
          <ul>{errList.map(([k, m]) => <li key={k}><a href={`#q-${k}`}>{t(questions.find((q) => q.id === k)?.text ?? k)}: {t(m)}</a></li>)}</ul>
        </div>
      )}
      {questions.map((q, idx) => (
        <fieldset key={q.id} id={`q-${q.id}`} aria-describedby={errors[q.id] ? `q-${q.id}-err` : undefined} aria-invalid={!!errors[q.id]}>
          <legend>{idx + 1}. {t(q.text)}</legend>
          <div className="choice-grid">
            {q.options.map((o) => {
              const id = `q-${q.id}-${o.value}`;
              const checked = q.type === "multi" ? ((answers[q.id] as string[] | undefined) ?? []).includes(o.value) : answers[q.id] === o.value;
              return (
                <label key={o.value} className="choice" htmlFor={id}>
                  <input id={id} type={q.type === "multi" ? "checkbox" : "radio"} name={q.id} value={o.value} checked={checked}
                    onChange={() => (q.type === "multi" ? toggleMulti(q, o.value) : setSingle(q, o.value))} />
                  <span>{t(o.label)}</span>
                </label>
              );
            })}
          </div>
          {errors[q.id] && <p className="field-error" id={`q-${q.id}-err`}>{t(errors[q.id]!)}</p>}
        </fieldset>
      ))}
      <div className="cluster">
        <button type="submit" className="btn btn-primary" disabled={!!busy}>{busy === "submit" ? <><span className="spinner" aria-hidden="true" /> {t("Submitting…")}</> : t("Submit answers")}</button>
        <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => send(false)}>{busy === "save" ? t("Saving…") : t("Save and finish later")}</button>
      </div>
    </form>
  );
}
