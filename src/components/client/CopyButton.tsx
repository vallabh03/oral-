"use client";
import { useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "./Toaster";

export function CopyButton({ value, label = "Copy", what = "Text" }: { value: string; label?: string; what?: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = value === "__CURRENT_URL__" ? window.location.href.split("#")[0]! : value;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast(`${what} copied to clipboard`, "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Could not copy automatically — select the text and copy it manually.", "error");
    }
  };
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy} aria-label={`${label}: ${what}`}>
      <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : label}
    </button>
  );
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
      <Icon name="printer" size={16} /> {label}
    </button>
  );
}
