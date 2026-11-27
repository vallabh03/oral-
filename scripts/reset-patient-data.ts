// Deletes ALL participant data before going live: registrations, consents, questionnaires,
// exams, results, reports, messages, identity photos, lesion images and virtual-screening photos
// (database rows and stored files). Participant IDs restart at 0001.
// Kept: staff accounts, camps, settings, the audit log (append-only) and anonymous analytics.
// Usage: reset-patient-data --confirm DELETE-ALL-PATIENT-DATA   (run as the database owner)
import { db, closeDbForTests } from "@/lib/server/db";
import { objectStore, type StoreKind } from "@/lib/server/storage";
import { audit } from "@/lib/server/audit";

export const CONFIRM = "DELETE-ALL-PATIENT-DATA";
// Truncating patients cascades to every table that references it (directly or through cases,
// exams, submissions, consents and reports).
const TABLES = ["patients"];

export async function resetPatientData(): Promise<{ patients: number; files: number; fileErrors: number }> {
  const d = await db();
  const patients = (await d.query<{ n: number }>("select count(*)::int as n from patients")).rows[0]!.n;
  const keys: { kind: StoreKind; key: string }[] = [];
  const add = (kind: StoreKind, rows: Record<string, string | null>[]) => rows.forEach((r) => Object.values(r).forEach((k) => k && keys.push({ kind, key: k })));
  add("photos", (await d.query<Record<string, string>>("select object_key, thumb_key from patient_photos")).rows);
  add("clinical", (await d.query<Record<string, string>>("select object_key, preview_key from lesion_images")).rows);
  add("clinical", (await d.query<Record<string, string>>("select object_key, preview_key from virtual_images")).rows);
  add("clinical", (await d.query<Record<string, string>>("select quarantine_key from virtual_upload_tickets")).rows);

  // Files first: if this stops halfway, the rows still point at what is left and it can be re-run.
  let fileErrors = 0;
  for (const { kind, key } of keys) await objectStore(kind).delete(key).catch(() => { fileErrors++; });

  await d.tx(async (q) => {
    await q.query(`truncate ${TABLES.join(", ")} restart identity cascade`);
    await q.query("alter sequence participant_seq restart with 1");
    await audit({ actorType: "system", action: "admin.reset_patient_data", outcome: "success", correlationId: crypto.randomUUID(), details: { patients, files: keys.length, fileErrors } }, q);
  });
  return { patients, files: keys.length, fileErrors };
}

if (process.argv[1]?.includes("reset-patient-data")) {
  if (process.argv[2] !== "--confirm" || process.argv[3] !== CONFIRM) {
    console.error(`Refusing: this permanently deletes all participant data. Re-run with: --confirm ${CONFIRM}`);
    process.exit(64);
  }
  const r = await resetPatientData();
  console.log(`Deleted ${r.patients} registrations and ${r.files} stored files${r.fileErrors ? ` (${r.fileErrors} files could not be deleted; run again)` : ""}. Participant IDs restart at 0001.`);
  await closeDbForTests();
}
