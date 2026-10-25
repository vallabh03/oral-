import QR from "qrcode";
import { handler } from "@/lib/server/http";
import { db } from "@/lib/server/db";
import { hashToken, randomToken } from "@/lib/server/security/crypto";
import { LIMITS } from "@/lib/server/security/rateLimit";

// Issues a fresh check-in QR for the participant (the previous one is revoked). The QR holds
// only a random token: scanning it is useless without an authenticated staff session.
export const POST = handler({ auth: "intake", rateLimit: [{ limit: LIMITS.intakeWrite, by: "user" }] }, async ({ intake }) => {
  const token = randomToken();
  const d = await db();
  await d.tx(async (q) => {
    await q.query("update intake_tokens set revoked_at = now() where patient_id = $1 and kind = 'qr' and revoked_at is null", [intake!.patientId]);
    await q.query("insert into intake_tokens (patient_id, token_hash, kind) values ($1, $2, 'qr')", [intake!.patientId, hashToken(token)]);
  });
  return { svg: await QR.toString(token, { type: "svg", margin: 1, width: 220, errorCorrectionLevel: "M" }) };
});
