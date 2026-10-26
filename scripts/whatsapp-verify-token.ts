// Prints the webhook verify token to paste into Meta App → WhatsApp → Configuration.
// Usage: WHATSAPP_APP_SECRET=... npm run whatsapp:verify-token
import crypto from "node:crypto";

const secret = process.env.WHATSAPP_APP_SECRET;
if (!secret) {
  console.error("Set WHATSAPP_APP_SECRET first.");
  process.exit(1);
}
console.log(crypto.createHmac("sha256", secret).update("verify-token").digest("hex").slice(0, 32));
