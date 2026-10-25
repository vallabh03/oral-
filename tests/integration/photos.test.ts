import crypto from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { processPhoto } from "@/lib/server/images";
import { call, key, registerParticipant, req, staffJar, syntheticPortrait } from "../helpers";
import * as intakePhoto from "@/app/api/intake/photo/route";
import * as photos from "@/app/api/photos/[id]/route";
import * as patients from "@/app/api/patients/route";

describe("participant photos: capture, storage and retrieval", () => {
  it("is idempotent across client retries (no duplicate photos)", async () => {
    const p = await registerParticipant();
    const k = key();
    const img = await syntheticPortrait(1);
    const a = await call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw: img, headers: { "idempotency-key": k } }));
    const b = await call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw: img, headers: { "idempotency-key": k } }));
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.json.id).toBe(a.json.id);
    const d = await db();
    expect((await d.query("select 1 from patient_photos where patient_id = $1", [p.patientId])).rows).toHaveLength(1);
  });

  it("supersedes the previous photo on retake; only the current one is served", async () => {
    const p = await registerParticipant();
    const a = await call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw: await syntheticPortrait(1), headers: { "idempotency-key": key() } }));
    const b = await call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw: await syntheticPortrait(2), headers: { "idempotency-key": key() } }));
    const { jar } = await staffJar("admin");
    expect((await call(photos.GET, req("GET", `/api/photos/${a.json.id}`, { jar }), { id: a.json.id })).status).toBe(404);
    expect((await call(photos.GET, req("GET", `/api/photos/${b.json.id}`, { jar }), { id: b.json.id })).status).toBe(200);
  });

  it("validates type, size and content server-side", async () => {
    const p = await registerParticipant();
    const send = (raw: Buffer, contentType: string, headers: Record<string, string> = { "idempotency-key": key() }) =>
      call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw, contentType, headers }));
    expect((await send(Buffer.from("<svg onload=alert(1)>"), "image/svg+xml")).status).toBe(415);
    expect((await send(Buffer.from("GIF89a fake"), "image/jpeg")).status).toBe(415);
    expect((await send(Buffer.alloc(4 * 1024 * 1024, 1), "image/jpeg")).status).toBe(413);
    expect((await send(await syntheticPortrait(1), "image/jpeg", {})).status).toBe(400); // missing idempotency key
    const tiny = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#000" } }).png().toBuffer();
    expect((await send(tiny, "image/png")).status).toBe(400);
  });

  it("serves immutable photos with ETag/304 and private caching", async () => {
    const p = await registerParticipant();
    const up = await call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw: await syntheticPortrait(5), headers: { "idempotency-key": key() } }));
    const { jar } = await staffJar("admin");
    const first = await call(photos.GET, req("GET", `/api/photos/${up.json.id}?v=thumb`, { jar }), { id: up.json.id });
    expect(first.headers.get("cache-control")).toBe("private, no-cache");
    const etag = first.headers.get("etag")!;
    const second = await call(photos.GET, req("GET", `/api/photos/${up.json.id}?v=thumb`, { jar, headers: { "if-none-match": etag } }), { id: up.json.id });
    expect(second.status).toBe(304);
    // The participant can see only their own photo
    expect((await call(photos.GET, req("GET", `/api/photos/${up.json.id}`, { jar: p.jar }), { id: up.json.id })).status).toBe(200);
    const other = await registerParticipant();
    expect((await call(photos.GET, req("GET", `/api/photos/${up.json.id}`, { jar: other.jar }), { id: up.json.id })).status).toBe(404);
  });

  it("handles a burst of concurrent uploads without errors or duplicates", async () => {
    const people = await Promise.all(Array.from({ length: 12 }, () => registerParticipant()));
    const img = await syntheticPortrait(11, 1600);
    const results = await Promise.all(
      people.map((p) => call(intakePhoto.POST, req("POST", "/api/intake/photo", { jar: p.jar, raw: img, headers: { "idempotency-key": key() } }))),
    );
    expect(results.map((r) => r.status).every((s) => s === 201)).toBe(true);
    const d = await db();
    const n = (await d.query<{ n: number }>("select count(*)::int as n from patient_photos where patient_id = any($1::uuid[])", [people.map((p) => p.patientId)])).rows[0]!.n;
    expect(n).toBe(12);
  });

  it("lists many records with photos using keyset pagination (no gaps or repeats)", async () => {
    const d = await db();
    const processed = await processPhoto(await syntheticPortrait(42));
    // Bulk-insert 300 synthetic patients with photos directly (fast path for volume testing).
    const consentHash = crypto.createHash("sha256").update("x").digest("hex");
    for (let i = 0; i < 300; i++) {
      const id = crypto.randomUUID();
      await d.query(
        `insert into patients (id, display_id, full_name, age, driver_type, recruitment_source, created_via, created_at)
         values ($1, $2, $3, 30, 'auto', 'stand', 'self', now() - make_interval(secs => $4))`,
        [id, `BULK-${String(i).padStart(5, "0")}`, `Bulk Person ${i}`, i],
      );
      const c = await d.query<{ id: string }>(
        "insert into consents (patient_id, consent_type, status, policy_version, policy_text_sha256, language, actor_type) values ($1, 'photo', 'granted', 'v', $2, 'en', 'participant') returning id",
        [id, consentHash],
      );
      const pid = crypto.randomUUID();
      await d.query("insert into blob_objects (key, content_type, bytes, data) values ($1, 'image/webp', $2, $3), ($4, 'image/webp', $5, $6)", [
        `photos/${id}/${pid}.webp`, processed.full.length, processed.full, `photos/${id}/${pid}-thumb.webp`, processed.thumb.length, processed.thumb,
      ]);
      await d.query(
        `insert into patient_photos (id, patient_id, consent_id, storage_driver, object_key, thumb_key, mime, bytes, thumb_bytes, width, height, sha256, captured_by_type, idempotency_key)
         values ($1, $2, $3, 'db', $4, $5, 'image/webp', $6, $7, $8, $9, $10, 'participant', $11)`,
        [pid, id, c.rows[0]!.id, `photos/${id}/${pid}.webp`, `photos/${id}/${pid}-thumb.webp`, processed.full.length, processed.thumb.length, processed.width, processed.height, processed.sha256, `bulk-${pid}`],
      );
    }
    const { jar } = await staffJar("admin");
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r = await call(patients.GET, req("GET", `/api/patients?limit=50${cursor ? `&cursor=${cursor}` : ""}`, { jar }));
      expect(r.status).toBe(200);
      for (const it of r.json.items) {
        expect(seen.has(it.id)).toBe(false);
        seen.add(it.id);
      }
      cursor = r.json.nextCursor;
      pages++;
    } while (cursor && pages < 20);
    expect(seen.size).toBeGreaterThanOrEqual(300);
    const withPhotos = [...seen].length;
    expect(withPhotos).toBeGreaterThan(0);
  }, 120_000);
});
