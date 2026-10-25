import { NextResponse } from "next/server";
import { handler } from "@/lib/server/http";
import { config } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";
import { oidcCallback } from "@/lib/server/services/oidc";
import { cookieOptions, staffCookieName } from "@/lib/server/security/session";

export const GET = handler({ auth: "public" }, async ({ req, correlationId }) => {
  const site = config().NEXT_PUBLIC_SITE_URL;
  try {
    const r = await oidcCallback(
      { code: req.nextUrl.searchParams.get("code"), state: req.nextUrl.searchParams.get("state") },
      req.cookies.get("ds_oidc")?.value,
      correlationId,
    );
    // Redirect target is chosen server-side from the role, never taken from the request.
    const res = NextResponse.redirect(new URL(r.redirect, site), 303);
    res.cookies.set(staffCookieName(), r.token, cookieOptions(r.maxAgeSec));
    res.cookies.set("ds_oidc", "", { ...cookieOptions(0), path: "/api/auth/oidc" });
    return res;
  } catch (e) {
    const code = e instanceof AppError ? e.code : "oidc_failed";
    return NextResponse.redirect(new URL(`/workspace/login?error=${encodeURIComponent(code)}`, site), 303);
  }
});
