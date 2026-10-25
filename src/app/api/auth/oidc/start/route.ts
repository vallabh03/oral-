import { NextResponse } from "next/server";
import { handler } from "@/lib/server/http";
import { oidcStart } from "@/lib/server/services/oidc";
import { cookieOptions } from "@/lib/server/security/session";

export const GET = handler({ auth: "public" }, async () => {
  const { url, cookie } = await oidcStart();
  const res = NextResponse.redirect(url, 302);
  // Lax so the cookie survives the top-level redirect back from the identity provider.
  res.cookies.set("ds_oidc", cookie, { ...cookieOptions(600), sameSite: "lax", path: "/api/auth/oidc" });
  return res;
});
