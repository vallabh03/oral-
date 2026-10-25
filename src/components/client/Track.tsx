"use client";
import Link from "next/link";
import { useEffect } from "react";
import type { AnalyticsEvent } from "@/lib/shared/analytics";
import { track } from "./analytics";

/** Fires a consented page-level conversion event once on mount. */
export function TrackView({ event }: { event: AnalyticsEvent }) {
  useEffect(() => track(event), [event]);
  return null;
}

/** A link that records a consented click event (e.g. register_cta_clicked). */
export function TrackedLink({ event, ...props }: React.ComponentProps<typeof Link> & { event: AnalyticsEvent }) {
  return <Link {...props} onClick={(e) => { track(event); props.onClick?.(e); }} />;
}
