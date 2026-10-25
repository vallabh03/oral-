"use client";
import { useState } from "react";

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input {...props} type={visible ? "text" : "password"} autoCapitalize="none" spellCheck={false} />
      <button type="button" onClick={() => setVisible((v) => !v)} aria-controls={props.id} aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"}>
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
