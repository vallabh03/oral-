import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { resetConfigForTests } from "@/lib/server/config";
import { oidcCallback, oidcStart, setOidcTestOverrides } from "@/lib/server/services/oidc";
import { db } from "@/lib/server/db";
import { seedUser } from "../../scripts/seed-lib";

// OIDC-provisioned accounts have no local password (they are linked by email on first sign-in).
async function oidcUser(email: string, role = "admin") {
  const d = await db();
  await d.query("insert into users (email, display_name, role) values ($1, $2, $3)", [email, "OIDC user", role]);
}
const ISSUER = "https://cognito-idp.ap-south-2.amazonaws.com/test-pool";

describe("Cognito / Google OIDC sign-in", () => {
  let privateKey: CryptoKey;
  beforeAll(async () => {
    Object.assign(process.env, { OIDC_ENABLED: "true", OIDC_ISSUER: ISSUER, OIDC_CLIENT_ID: "client-123", OIDC_REDIRECT_URI: "http://localhost:3000/api/auth/oidc/callback" });
    resetConfigForTests();
    const kp = await generateKeyPair("RS256");
    privateKey = kp.privateKey as CryptoKey;
    const jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256" };
    setOidcTestOverrides({ discovery: { issuer: ISSUER, authorization_endpoint: `${ISSUER}/oauth2/authorize`, token_endpoint: `${ISSUER}/oauth2/token`, jwks_uri: `${ISSUER}/jwks` }, jwks: createLocalJWKSet({ keys: [jwk] }) });
  });
  afterAll(() => {
    process.env.OIDC_ENABLED = "false";
    resetConfigForTests();
    vi.unstubAllGlobals();
  });

  const idToken = (claims: Record<string, unknown>) =>
    new SignJWT({ email_verified: true, ...claims }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(ISSUER).setAudience("client-123").setIssuedAt().setExpirationTime("5m").setSubject(String(claims.sub ?? "sub-1")).sign(privateKey);

  async function flow(claims: Record<string, unknown>, tamper?: (c: { state: string; nonce: string; verifier: string }) => void) {
    const start = await oidcStart();
    const url = new URL(start.url);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/oidc/callback");
    const saved = JSON.parse(start.cookie);
    const token = await idToken({ nonce: saved.nonce, ...claims });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: token }), { status: 200 })));
    tamper?.(saved);
    return oidcCallback({ code: "auth-code", state: url.searchParams.get("state") }, JSON.stringify(saved), "corr");
  }

  it("signs in a pre-provisioned active user and maps the internal role", async () => {
    await oidcUser("google.doc@example.test");
    const r = await flow({ email: "google.doc@example.test", sub: "google-sub-1" });
    expect(r.redirect).toBe("/workspace/admin");
  });

  it("rejects users who are not provisioned (Google identity alone grants nothing)", async () => {
    await expect(flow({ email: "stranger@gmail.com", sub: "x" })).rejects.toMatchObject({ status: 403 });
  });

  it("never links a password account by email, and requires a verified email", async () => {
    await seedUser("pw.staff@example.test", "Password staff", "super_admin");
    await expect(flow({ email: "pw.staff@example.test", sub: "attacker-sub" })).rejects.toMatchObject({ status: 403 });
    await oidcUser("unverified@example.test");
    await expect(flow({ email: "unverified@example.test", sub: "u1", email_verified: undefined })).rejects.toMatchObject({ status: 401 });
  });

  it("rejects state and nonce mismatches", async () => {
    await oidcUser("google.doc2@example.test");
    await expect(flow({ email: "google.doc2@example.test", sub: "s2" }, (c) => (c.state = "evil"))).rejects.toMatchObject({ status: 400 });
    await expect(flow({ email: "google.doc2@example.test", sub: "s2", nonce: "wrong" })).rejects.toMatchObject({ status: 401 });
  });
});
