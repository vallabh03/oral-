"use client";
import { useRef, useState } from "react";
import { CONSENT_POLICIES, CONTACT_PREFERENCES, DRIVER_TYPES, LANGUAGES, RECRUITMENT_SOURCES, SCREENING_MODES, TRANSLATED_LANGUAGES, type LanguageCode, type ScreeningMode } from "@/lib/shared/constants";
import { newKey, postJson, type ApiError } from "./api";
import { track } from "./analytics";
import { TELANGANA_DISTRICTS } from "@/lib/shared/virtual";

export type CampOption = { id: string; name: string; working_area: string };
type Values = {
  language: LanguageCode; fullName: string; age: string; mobile: string; driverType: string; workingArea: string; campId: string;
  recruitmentSource: string; contactPreference: string; screeningMode: ScreeningMode;
  district: string; mandal: string; pincode: string; addressLine: string;
  consents: { registration: boolean; screening: boolean; followupContact: boolean; whatsappReport: boolean; photo: boolean; remoteImages: boolean; reviewNotifications: boolean };
};

const INITIAL: Values = {
  language: "en", fullName: "", age: "", mobile: "", driverType: "", workingArea: "", campId: "", recruitmentSource: "", contactPreference: "none", screeningMode: "in_person", district: "", mandal: "", pincode: "", addressLine: "",
  consents: { registration: false, screening: false, followupContact: false, whatsappReport: false, photo: false, remoteImages: false, reviewNotifications: false }, // optional consents are opt-in, never pre-ticked
};

type Props = {
  endpoint: string;
  camps: CampOption[];
  staffMode?: boolean;
  /** Public form: fixed by the page the participant came from. Staff choose it in the form. */
  screeningMode?: ScreeningMode;
  /** Photo-based virtual screening is switched on (shows the mouth-photo consent). */
  virtualPhotos?: boolean;
  onRegistered: (r: { displayId: string; id?: string; resumeToken?: string; photoConsent: boolean }) => void;
};

/** Registration + separate consents (FR-PAR-02/03). Same server-side schema validates both modes. */
export function RegistrationForm({ endpoint, camps, staffMode = false, screeningMode = "in_person", virtualPhotos = false, onRegistered }: Props) {
  const [v, setV] = useState<Values>({ ...INITIAL, screeningMode });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const key = useRef(newKey());
  const summary = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const lang = LANGUAGES.find((l) => l.code === v.language)!;
  const steps = ["Language", "Your details", "Consent"];

  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((x) => ({ ...x, [k]: val }));
  const setConsent = (k: keyof Values["consents"], val: boolean) => setV((x) => ({ ...x, consents: { ...x.consents, [k]: val } }));

  const validateDetails = () => {
    const e: Record<string, string> = {};
    if (!v.fullName.trim()) e.fullName = "Enter the full name";
    const age = Number(v.age);
    if (!v.age || !Number.isInteger(age) || age < 14 || age > 110) e.age = "Enter an age between 14 and 110";
    if (v.mobile && !/^[6-9]\d{9}$/.test(v.mobile)) e.mobile = "Enter a valid 10-digit Indian mobile number";
    if (!v.driverType) e.driverType = "Choose your profession";
    if (!v.recruitmentSource) e.recruitmentSource = "Choose how you heard about us";
    if (v.contactPreference !== "none" && !v.mobile) e.mobile = "A mobile number is needed to contact you";
    else if (v.screeningMode === "virtual" && !v.mobile) e.mobile = "A mobile number is needed so the team can call for virtual screening";
    // District and PIN code are optional (2026-11-01); a PIN, when given, must be valid.
    if (v.pincode && !/^[1-9]\d{5}$/.test(v.pincode)) e.pincode = "Enter a valid 6-digit PIN code";
    return e;
  };
  const validateConsent = () => {
    const e: Record<string, string> = {};
    if (!v.consents.registration) e["consents.registration"] = "Registration consent is required to continue";
    if (!v.consents.screening) e["consents.screening"] = "Screening consent is required to continue";
    if ((v.consents.whatsappReport || v.consents.followupContact || v.consents.reviewNotifications) && !v.mobile) e.mobile = "Add a mobile number on the previous step to receive messages";
    if (v.screeningMode === "virtual" && virtualPhotos && !v.consents.remoteImages) e["consents.remoteImages"] = "This consent is needed to send your mouth photos for virtual screening";
    if (v.screeningMode === "virtual" && virtualPhotos && !v.consents.reviewNotifications) e["consents.reviewNotifications"] = "This consent is needed so we can send you the doctor's review";
    return e;
  };

  const goto = (n: number) => {
    setErrors({});
    setStep(n);
    requestAnimationFrame(() => document.getElementById("reg-step-heading")?.focus());
  };

  const next = () => {
    if (step === 0) {
      if (!started.current) {
        started.current = true;
        if (!staffMode) track("registration_started");
      }
      return goto(1);
    }
    if (step === 1) {
      const e = validateDetails();
      if (Object.keys(e).length) {
        setErrors(e);
        return requestAnimationFrame(() => summary.current?.focus());
      }
      return goto(2);
    }
  };

  const submit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (step < 2) return next();
    const e = { ...validateDetails(), ...validateConsent() };
    if (Object.keys(e).length) {
      setErrors(e);
      return requestAnimationFrame(() => summary.current?.focus());
    }
    setBusy(true);
    setFailure("");
    try {
      const r = await postJson<{ displayId: string; id?: string; resumeToken?: string }>(endpoint, {
        fullName: v.fullName.trim(), age: Number(v.age), mobile: v.mobile || undefined, driverType: v.driverType, workingArea: v.workingArea.trim() || undefined,
        campId: v.campId || undefined, recruitmentSource: v.recruitmentSource, contactPreference: v.contactPreference, screeningMode: v.screeningMode, language: v.language,
        district: v.district || undefined, mandal: v.mandal.trim() || undefined, pincode: v.pincode || undefined, addressLine: v.addressLine.trim() || undefined,
        consents: { ...v.consents, remoteImages: v.screeningMode === "virtual" && v.consents.remoteImages, reviewNotifications: v.screeningMode === "virtual" && v.consents.reviewNotifications }, idempotencyKey: key.current,
      });
      onRegistered({ ...r, photoConsent: v.consents.photo });
    } catch (err) {
      const a = err as ApiError;
      if (a.fields) {
        setErrors(a.fields);
        if (Object.keys(a.fields).some((k) => !k.startsWith("consents"))) setStep(1);
        requestAnimationFrame(() => summary.current?.focus());
      }
      setFailure(a.message);
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => errors[k] && <p className="field-error" id={`${k}-err`}>{errors[k]}</p>;
  const aria = (k: string) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-err` : undefined });
  const errList = Object.entries(errors);
  const subject = staffMode ? "the participant" : "you";

  return (
    <form onSubmit={submit} noValidate dir={lang.dir} lang={v.language}>
      <p className="step-label">Step {step + 1} of {steps.length}: {steps[step]}</p>
      <ol className="steps" aria-hidden="true">{steps.map((s, i) => <li key={s} data-state={i < step ? "done" : i === step ? "current" : "todo"} />)}</ol>
      {errList.length > 0 && (
        <div className="error-summary" ref={summary} tabIndex={-1} role="alert">
          <h2>Please fix {errList.length === 1 ? "this" : `these ${errList.length} problems`}</h2>
          <ul>{errList.map(([k, m]) => <li key={k}><a href={`#${k.replace("consents.", "c-")}`}>{m}</a></li>)}</ul>
        </div>
      )}
      {failure && !errList.length && <div className="error-summary" role="alert"><h2>Registration was not completed</h2><p style={{ margin: 0 }}>{failure}</p></div>}

      {step === 0 && (
        <section aria-labelledby="reg-step-heading">
          <h2 id="reg-step-heading" tabIndex={-1} style={{ fontSize: "var(--step-2)" }}>Choose a language</h2>
          <div className="field">
            <label htmlFor="language">Preferred language</label>
            <select id="language" value={v.language} onChange={(e) => set("language", e.target.value as LanguageCode)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}{l.native !== l.name ? ` — ${l.name}` : ""}</option>)}
            </select>
          </div>
          {!TRANSLATED_LANGUAGES.includes(v.language) && (
            <p className="callout callout-warn" role="status">A reviewed {lang.name} translation is not available yet, so the form is shown in English. Camp staff can help you.</p>
          )}
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="reg-step-heading">
          <h2 id="reg-step-heading" tabIndex={-1} style={{ fontSize: "var(--step-2)" }}>{staffMode ? "Participant details" : "Your details"}</h2>
          <p className="hint" style={{ marginBottom: 16 }}>We only ask for what screening and follow-up need. No Aadhaar or home address.</p>
          {staffMode && (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
              <legend style={{ fontWeight: 600, marginBottom: 6 }}>Screening type <span className="req" aria-hidden="true">*</span></legend>
              <div className="cluster">
                {SCREENING_MODES.map((m) => (
                  <label key={m.value} className="cluster" style={{ gap: 6, fontWeight: 400 }}>
                    <input type="radio" name="screeningMode" value={m.value} checked={v.screeningMode === m.value} onChange={() => set("screeningMode", m.value)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="form-row">
            <div className="field">
              <label htmlFor="fullName">Full name <span className="req" aria-hidden="true">*</span></label>
              <input id="fullName" type="text" autoComplete={staffMode ? "off" : "name"} maxLength={120} value={v.fullName} onChange={(e) => set("fullName", e.target.value)} {...aria("fullName")} />
              {err("fullName")}
            </div>
            <div className="field">
              <label htmlFor="age">Age in years <span className="req" aria-hidden="true">*</span></label>
              <input id="age" type="number" inputMode="numeric" min={14} max={110} value={v.age} onChange={(e) => set("age", e.target.value)} {...aria("age")} />
              {err("age")}
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="mobile">Mobile number <span className="opt">{v.screeningMode === "virtual" ? "(needed so the team can call)" : "(optional — needed for messages)"}</span></label>
              <input id="mobile" type="tel" inputMode="numeric" autoComplete={staffMode ? "off" : "tel-national"} maxLength={10} placeholder="10 digits" value={v.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))} {...aria("mobile")} />
              {err("mobile")}
            </div>
            <div className="field">
              <label htmlFor="driverType">Profession <span className="req" aria-hidden="true">*</span></label>
              <select id="driverType" value={v.driverType} onChange={(e) => set("driverType", e.target.value)} {...aria("driverType")}>
                <option value="">Choose…</option>
                {DRIVER_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {err("driverType")}
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="workingArea">Usual working area <span className="opt">(optional)</span></label>
              <input id="workingArea" type="text" maxLength={120} placeholder="e.g. Ameerpet" value={v.workingArea} onChange={(e) => set("workingArea", e.target.value)} {...aria("workingArea")} />
              {err("workingArea")}
            </div>
            <div className="field">
              <label htmlFor="campId">Screening camp <span className="opt">{staffMode ? "" : "(if you know it)"}</span></label>
              <select id="campId" value={v.campId} onChange={(e) => set("campId", e.target.value)} {...aria("campId")}>
                <option value="">{staffMode ? "Choose a camp…" : "Not sure yet"}</option>
                {camps.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.working_area}</option>)}
              </select>
              {err("campId")}
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="recruitmentSource">How did {subject} hear about us? <span className="req" aria-hidden="true">*</span></label>
              <select id="recruitmentSource" value={v.recruitmentSource} onChange={(e) => set("recruitmentSource", e.target.value)} {...aria("recruitmentSource")}>
                <option value="">Choose…</option>
                {RECRUITMENT_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {err("recruitmentSource")}
            </div>
            <div className="field">
              <label htmlFor="contactPreference">Contact preference</label>
              <select id="contactPreference" value={v.contactPreference} onChange={(e) => set("contactPreference", e.target.value)}>
                {CONTACT_PREFERENCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {v.screeningMode === "virtual" && (
            <>
              <h3 style={{ fontSize: "1.05rem", margin: "8px 0 4px" }}>Where you live</h3>
              <p className="hint" style={{ marginBottom: 12 }}>So we can suggest the nearest clinic or camp if an examination is needed.</p>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="district">District <span className="opt">(optional)</span></label>
                  <select id="district" value={v.district} onChange={(e) => set("district", e.target.value)} {...aria("district")}>
                    <option value="">Choose…</option>
                    {TELANGANA_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {err("district")}
                </div>
                <div className="field">
                  <label htmlFor="mandal">Mandal / area <span className="opt">(optional)</span></label>
                  <input id="mandal" type="text" maxLength={80} value={v.mandal} onChange={(e) => set("mandal", e.target.value)} {...aria("mandal")} />
                  {err("mandal")}
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="pincode">PIN code <span className="opt">(optional)</span></label>
                  <input id="pincode" type="text" inputMode="numeric" autoComplete={staffMode ? "off" : "postal-code"} maxLength={6} placeholder="6 digits" value={v.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} {...aria("pincode")} />
                  {err("pincode")}
                </div>
                <div className="field">
                  <label htmlFor="addressLine">Full address <span className="opt">(optional)</span></label>
                  <input id="addressLine" type="text" maxLength={300} autoComplete={staffMode ? "off" : "street-address"} value={v.addressLine} onChange={(e) => set("addressLine", e.target.value)} {...aria("addressLine")} />
                  {err("addressLine")}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="reg-step-heading">
          <h2 id="reg-step-heading" tabIndex={-1} style={{ fontSize: "var(--step-2)" }}>Consent</h2>
          <p className="hint" style={{ marginBottom: 12 }}>{v.screeningMode === "virtual" && virtualPhotos ? "The first four are required." : "The first two are required."} The others are optional and can be withdrawn at any time.</p>
          <fieldset>
            <legend>Required</legend>
            {(["registration", "screening"] as const).map((k) => (
              <div key={k}>
                <label className="choice" htmlFor={`c-${k}`}>
                  <input id={`c-${k}`} type="checkbox" checked={v.consents[k]} onChange={(e) => setConsent(k, e.target.checked)} aria-invalid={!!errors[`consents.${k}`]} aria-describedby={errors[`consents.${k}`] ? `consents.${k}-err` : undefined} />
                  <span>{CONSENT_POLICIES[k].text}</span>
                </label>
                {err(`consents.${k}`)}
              </div>
            ))}
            {v.screeningMode === "virtual" && virtualPhotos && (
              <div>
                <label className="choice" htmlFor="c-remoteImages">
                  <input id="c-remoteImages" type="checkbox" checked={v.consents.remoteImages} onChange={(e) => setConsent("remoteImages", e.target.checked)} aria-invalid={!!errors["consents.remoteImages"]} aria-describedby={errors["consents.remoteImages"] ? "consents.remoteImages-err" : undefined} />
                  <span>{CONSENT_POLICIES.remote_images.text}</span>
                </label>
                {err("consents.remoteImages")}
                <label className="choice" htmlFor="c-reviewNotifications">
                  <input id="c-reviewNotifications" type="checkbox" checked={v.consents.reviewNotifications} onChange={(e) => setConsent("reviewNotifications", e.target.checked)} aria-invalid={!!errors["consents.reviewNotifications"]} aria-describedby={errors["consents.reviewNotifications"] ? "consents.reviewNotifications-err" : undefined} />
                  <span>{CONSENT_POLICIES.review_notifications.text}</span>
                </label>
                {err("consents.reviewNotifications")}
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend>Optional</legend>
            <label className="choice" htmlFor="c-photo"><input id="c-photo" type="checkbox" checked={v.consents.photo} onChange={(e) => setConsent("photo", e.target.checked)} /><span>{CONSENT_POLICIES.photo.text}</span></label>
            <label className="choice" htmlFor="c-followupContact"><input id="c-followupContact" type="checkbox" checked={v.consents.followupContact} onChange={(e) => setConsent("followupContact", e.target.checked)} /><span>{CONSENT_POLICIES.followup_contact.text}</span></label>
            <label className="choice" htmlFor="c-whatsappReport"><input id="c-whatsappReport" type="checkbox" checked={v.consents.whatsappReport} onChange={(e) => setConsent("whatsappReport", e.target.checked)} /><span>{CONSENT_POLICIES.whatsapp_report.text}</span></label>
          </fieldset>
          <p className="hint">Consent wording version {CONSENT_POLICIES.registration.version} (draft pending approval). Read the <a href="/privacy" target="_blank" rel="noopener">privacy notice</a>.</p>
        </section>
      )}

      <div className="cluster" style={{ marginTop: 8 }}>
        {step > 0 && <button type="button" className="btn btn-ghost" onClick={() => goto(step - 1)} disabled={busy}>Back</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {step < 2 ? "Continue" : busy ? <><span className="spinner" aria-hidden="true" /> Registering…</> : staffMode ? "Register participant" : "Register"}
        </button>
      </div>
    </form>
  );
}
