"use client";
import { T, useT, LanguageSelector, ClinicalLanguageNotice, useLanguage, useLocalizedValidation } from "@/app/language";
import { useState } from "react";
import { Field, Choice, Check } from "./care-ui";
import { pilotConsent, visible, type Protocol } from "@/lib/domain";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
export function Registration({
  camps,
  save,
  demo = true,
  privacyNotice,
  consentVersion,
}: {
  camps: any[];
  save: (data: any) => Promise<void>;
  demo?: boolean;
  privacyNotice?: string;
  consentVersion?: string;
}) {
  const t = useT();
  const validation = useLocalizedValidation();
  const { locale } = useLanguage();
  const [d, setD] = useState({
    name: "",
    phone: "",
    age: "",
    campId: camps[0]?.id || "",
    driverType: "Auto",
    workingArea: "",
    recruitment: "Stand",
    contactIntended: true,
    registrationConsent: false,
    screeningConsent: false,
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setD({ ...d, [k]: v });
  return (
    <form {...validation}
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await save({ ...d, age: Number(d.age), preferredLanguage: locale });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <LanguageSelector registration /><ClinicalLanguageNotice /><div className="step-label">
        <span className="current"><T text={"1 · Registration & consent"} /></span>
        <span><T text={"2 · Brief questionnaire"} /></span>
      </div>
      {demo && (
        <p className="notice"><T text={"Evaluation mode. Use made-up details and a name starting with “Demo ”."} /></p>
      )}
      <div className="form-grid">
        <Field label="Name *">
          <input
            required
            maxLength={120}
            autoComplete="off"
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={demo ? "Demo Participant G" : "Full name"}
          />
        </Field>
        <Field label="Age in years *">
          <input
            required
            type="number"
            min="0"
            max="120"
            value={d.age}
            onChange={(e) => set("age", e.target.value)}
          />
        </Field>
        <Field label="Screening site / event *">
          <Choice
            label="Screening camp"
            value={d.campId}
            onChange={(v) => set("campId", v)}
            options={camps.map((c) => c.id)}
            labels={Object.fromEntries(camps.map((c) => [c.id, c.name]))}
          />
          <small>
            {camps.find((c) => c.id === d.campId)?.name ||
              "No camp is available"}
          </small>
        </Field>
        <Field label="Driver type *">
          <Choice
            label="Driver type"
            value={d.driverType}
            onChange={(v) => set("driverType", v)}
            options={["Auto", "Cab-Taxi", "App-based cab", "Other"]}
          />
        </Field>
        <Field label="Usual working area *">
          <input
            required
            maxLength={160}
            value={d.workingArea}
            onChange={(e) => set("workingArea", e.target.value)}
            placeholder={t("Area or stand")}
          />
        </Field>
        <Field label="How did you hear about DRIVE SAFE? *">
          <Choice
            label="Recruitment source"
            value={d.recruitment}
            onChange={(v) => set("recruitment", v)}
            options={[
              "Driver association",
              "Stand",
              "WhatsApp",
              "Colleague",
              "Poster",
              "Other",
            ]}
          />
        </Field>
      </div>
      <Check
        checked={d.contactIntended}
        onChange={(v) => set("contactIntended", v)}
      ><T text={"Follow-up or contact is intended"} /></Check>
      <Field
        label={
          d.contactIntended ? "Mobile number *" : "Mobile number (optional)"
        }
      >
        <input
          type="tel"
          inputMode="tel"
          required={d.contactIntended}
          pattern="\+?[0-9]{10,15}"
          maxLength={16}
          value={d.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder={demo ? "0000000007" : "Mobile number"}
        />
        <small><T text={"Required only when follow-up/contact is intended."} /></small>
      </Field>
      <section className="consent-box">
        <h3><T text={"Participation & screening consent"} /></h3>
        <p><T text={pilotConsent} clinical /></p>
        {privacyNotice && <p><T text={privacyNotice} clinical /></p>}
        <p><T text={"We record identity/contact information, screening answers and clinician findings to coordinate screening, referrals and follow-up. Authorized programme staff can access information needed for their role. Test information is recorded only when separately consented. Ask the camp coordinator for assistance, corrections or privacy questions."} clinical /></p>
        <p className="fine">
          {demo
            ? "Provisional wording · DRIVE SAFE v1.0 · Must be reviewed before live deployment."
            : "Consent version " + consentVersion}
        </p>
        <Check
          checked={d.registrationConsent}
          onChange={(v) => set("registrationConsent", v)}
        ><T text={"I voluntarily agree to participate and to the collection of this registration information."} /></Check>
        <Check
          checked={d.screeningConsent}
          onChange={(v) => set("screeningConsent", v)}
        ><T text={"I understand and consent to the screening process described above."} clinical /></Check>
      </section>
      {error && (
        <p role="alert" className="error">
          <T text={error} />
        </p>
      )}
      <button
        type="submit"
        className="primary"
        disabled={
          busy || !d.registrationConsent || !d.screeningConsent || !d.campId
        }
      >
        <T>{busy ? "Saving registration…" : "Continue to questionnaire"}</T>
        <ArrowRight size={17} />
      </button>
      <p className="fine">
        <ShieldCheck size={14} /><T text={" No Aadhaar, home address or lesion photographs are collected."} clinical /></p>
    </form>
  );
}
export function Questionnaire({
  protocol,
  submit,
}: {
  protocol: Protocol;
  submit: (answers: any) => Promise<any>;
}) {
  const t = useT();
  const validation = useLocalizedValidation();
  const [answers, setAnswers] = useState<Record<string, any>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  if (done)
    return (
      <div className="success-state">
        <CheckCircle2 size={44} />
        <h2><T text={"Your screening responses have been recorded."} /></h2>
        <p><T text={"Our medical team will guide you through your oral examination and the appropriate next step."} /></p>
        <p className="muted"><T text={"A clinical group will be recorded only after examination and clinician verification."} /></p>
      </div>
    );
  return (
    <form {...validation}
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await submit(answers);
          setDone(true);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <ClinicalLanguageNotice /><p className="muted"><T text={"About 2 minutes · "} />{protocol.version}</p>
      {protocol.questions
        .filter((q) => visible(q, answers))
        .map((q, i) => (
          <fieldset className="question" key={q.id}>
            <legend>
              {i + 1}. <T text={q.text} clinical />
              <T>{q.required ? " *" : ""}</T>
            </legend>
            {q.type === "multiple" ? (
              <div className="check-grid">
                {q.options?.map((o) => (
                  <Check
                    key={o}
                    checked={(answers[q.id] || []).includes(o)}
                    onChange={(checked) => {
                      let v = answers[q.id] || [];
                      v = checked
                        ? o === "None"
                          ? ["None"]
                          : [...v.filter((a: string) => a !== "None"), o]
                        : v.filter((a: string) => a !== o);
                      setAnswers({ ...answers, [q.id]: v });
                    }}
                  >
                    <T text={o} clinical />
                  </Check>
                ))}
              </div>
            ) : ["single", "frequency", "yesno"].includes(q.type) ? (
              <Choice
                clinical label={q.text}
                value={
                  typeof answers[q.id] === "boolean"
                    ? answers[q.id]
                      ? "Yes"
                      : "No"
                    : answers[q.id] || ""
                }
                onChange={(v) =>
                  setAnswers({
                    ...answers,
                    [q.id]: q.type === "yesno" ? v === "Yes" : v,
                  })
                }
                options={q.type === "yesno" ? ["Yes", "No"] : q.options || []}
              />
            ) : (
              <input
                aria-label={q.text}
                required={q.required}
                type={
                  ["number", "duration"].includes(q.type) ? "number" : "text"
                }
                min="0"
                value={answers[q.id] ?? ""}
                onChange={(e) =>
                  setAnswers({
                    ...answers,
                    [q.id]: ["number", "duration"].includes(q.type)
                      ? Number(e.target.value)
                      : e.target.value,
                  })
                }
              />
            )}
            {q.unit && <small><T text={q.unit} clinical /></small>}
          </fieldset>
        ))}
      {error && (
        <p className="error" role="alert">
          <T text={error} />
        </p>
      )}
      <button className="primary" disabled={busy}>
        <T>{busy ? "Recording responses…" : "Record screening responses"}</T>
      </button>
    </form>
  );
}
