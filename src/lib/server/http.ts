import "server-only";
import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { AppError, Errors } from "./errors";
import { config } from "./config";
import { db } from "./db";
import { audit } from "./audit";
import { can, type Permission } from "./authz";
import { enforceRateLimit, type Limit } from "./security/rateLimit";
import { intakeCookieName, readIntakeSession, readStaffSession, staffCookieName, type IntakeSession, type StaffSession } from "./security/session";
import { hashIp, safeEqual } from "./security/crypto";

type AuthMode = "public" | "staff" | "staff-pending-mfa" | "intake" | "staff-or-intake";

export type Ctx<B> = {
  req: NextRequest;
  correlationId: string;
  ip: string;
  ipKey: string;
  staff: StaffSession | null;
  intake: IntakeSession | null;
  body: B;
  params: Record<string, string>;
};

type Opts<S extends z.ZodTypeAny | undefined> = {
  auth: AuthMode;
  permission?: Permission;
  body?: S;
  /** "raw" skips JSON parsing (e.g. image uploads, webhooks). */
  rawBody?: boolean;
  maxBodyBytes?: number;
  rateLimit?: { limit: Limit; by: "ip" | "user" | "ip+user" }[];
  /** Origin/CSRF checks for state-changing requests. Default true. Webhooks set false. */
  csrf?: boolean;
};

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function clientIp(req: NextRequest): string {
  // Trusted proxies (CloudFront/Amplify) *append* the address they saw, so only the right-most
  // TRUSTED_PROXY_HOPS entries are trustworthy; anything to the left is client-controlled.
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1));
  const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (parts[parts.length - hops] || req.headers.get("x-real-ip") || (req as unknown as { ip?: string }).ip || "unknown").slice(0, 64);
}

function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const site = new URL(config().NEXT_PUBLIC_SITE_URL).origin;
  if (origin) return origin === site || (!config().isProd && origin === req.nextUrl.origin);
  // Browsers always send Origin on cross-site POSTs; fall back to Fetch Metadata if absent.
  const sfs = req.headers.get("sec-fetch-site");
  return sfs === "same-origin";
}

export function json(data: unknown, init?: number | ResponseInit) {
  const res = NextResponse.json(data, typeof init === "number" ? { status: init } : init);
  if (!res.headers.has("cache-control")) res.headers.set("cache-control", "no-store");
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("x-frame-options", "DENY");
  return res;
}

export function errorResponse(e: unknown, correlationId: string, route: string): NextResponse {
  if (e instanceof AppError) {
    const res = json({ error: { code: e.code, message: e.message, fields: e.fields }, correlationId }, e.status);
    if (e.retryAfter) res.headers.set("retry-after", String(e.retryAfter));
    return res;
  }
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of e.issues) fields[i.path.join(".") || "_"] = i.code === "unrecognized_keys" ? "Unexpected field" : i.message;
    return json({ error: { code: "validation_failed", message: "Please correct the highlighted fields.", fields }, correlationId }, 422);
  }
  // Unknown failure: log a category only (no stack/PHI to the client), keep details server-side.
  const code = (e as { code?: string })?.code ?? "unknown";
  console.error(`[error] correlation=${correlationId} route=${route} code=${code}`, config().isProd ? "" : e);
  void db()
    .then((d) => d.query("insert into app_errors (category, code, route, correlation_id) values ($1, $2, $3, $4)", ["internal", String(code).slice(0, 40), route, correlationId]))
    .catch(() => {});
  return json({ error: { code: "internal_error", message: "Something went wrong. Please try again." }, correlationId }, 500);
}

export function handler<S extends z.ZodTypeAny | undefined = undefined>(
  opts: Opts<S>,
  fn: (ctx: Ctx<S extends z.ZodTypeAny ? z.infer<S> : undefined>) => Promise<Response | Record<string, unknown>>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const correlationId = crypto.randomUUID();
    const route = req.nextUrl.pathname.replace(/[0-9a-f-]{36}/g, ":id");
    const ip = clientIp(req);
    const ipKey = hashIp(ip);
    let staff: StaffSession | null = null;
    try {
      if (UNSAFE.has(req.method) && opts.csrf !== false && !originAllowed(req)) {
        throw new AppError(403, "bad_origin", "Request blocked.");
      }

      const intakeNeeded = opts.auth === "intake" || opts.auth === "staff-or-intake";
      const staffNeeded = opts.auth === "staff" || opts.auth === "staff-pending-mfa" || opts.auth === "staff-or-intake";
      staff = staffNeeded ? await readStaffSession(req.cookies.get(staffCookieName())?.value) : null;
      const intake = intakeNeeded && !staff ? await readIntakeSession(req.cookies.get(intakeCookieName())?.value) : null;

      if (opts.auth === "staff" || opts.auth === "staff-pending-mfa") {
        if (!staff) throw Errors.unauthenticated();
        if (opts.auth === "staff" && !staff.mfaVerified) throw new AppError(401, "mfa_required", "Complete two-step verification to continue.");
      }
      if (opts.auth === "intake" && !intake) throw new AppError(401, "intake_session_required", "Your registration session has expired. Please resume with your link.");
      if (opts.auth === "staff-or-intake") {
        if (staff && !staff.mfaVerified) staff = null;
        if (!staff && !intake) throw Errors.unauthenticated();
      }
      if (staff && UNSAFE.has(req.method) && opts.csrf !== false) {
        const sent = req.headers.get("x-csrf-token") ?? "";
        if (!safeEqual(sent, staff.csrfToken)) throw new AppError(403, "csrf_failed", "Your session token is invalid. Refresh the page and try again.");
      }
      if (opts.permission && staff && !can(staff.role, opts.permission)) {
        await audit({ actorType: "staff", actorId: staff.userId, action: "permission.denied", outcome: "denied", correlationId, code: opts.permission, details: { route, method: req.method } });
        throw Errors.forbidden();
      }

      for (const rl of opts.rateLimit ?? []) {
        const who = rl.by === "ip" ? ipKey : rl.by === "user" ? (staff?.userId ?? intake?.patientId ?? ipKey) : `${ipKey}:${staff?.userId ?? intake?.patientId ?? ""}`;
        await enforceRateLimit(rl.limit, who);
      }

      let body: unknown = undefined;
      if (UNSAFE.has(req.method) && !opts.rawBody) {
        const max = opts.maxBodyBytes ?? 64 * 1024;
        const len = Number(req.headers.get("content-length") ?? "0");
        if (len > max) throw Errors.tooLarge();
        const text = await req.text();
        if (Buffer.byteLength(text) > max) throw Errors.tooLarge();
        if (opts.body) {
          const ct = req.headers.get("content-type") ?? "";
          if (!ct.includes("application/json")) throw Errors.unsupported("Send JSON (application/json).");
          let parsed: unknown;
          try {
            parsed = JSON.parse(text || "null");
          } catch {
            throw Errors.badRequest("Malformed JSON.");
          }
          body = opts.body.parse(parsed);
        }
      }

      const params = (await routeCtx?.params) ?? {};
      const result = await fn({ req, correlationId, ip, ipKey, staff, intake, body: body as never, params });
      const res = result instanceof Response ? result : json(result);
      res.headers.set("x-correlation-id", correlationId);
      return res;
    } catch (e) {
      if (e instanceof AppError && (e.status === 401 || e.status === 403) && e.code !== "forbidden") {
        // Authentication failures are logged (permission denials are audited above).
        await audit({ actorType: staff ? "staff" : "anonymous", actorId: staff?.userId ?? null, action: "auth.rejected", outcome: "denied", correlationId, code: e.code, details: { route, method: req.method } }).catch(() => {});
      }
      const res = errorResponse(e, correlationId, route);
      res.headers.set("x-correlation-id", correlationId);
      return res;
    }
  };
}

export const uuidParam = z.string().uuid();
