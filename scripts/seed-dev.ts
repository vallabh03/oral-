// Development seed: staff accounts (password + TOTP), camps and a few synthetic participants.
// Credentials are written to .dev-credentials.json (git-ignored), never printed.
import crypto from "node:crypto";
import { closeDbForTests } from "@/lib/server/db";
import { registerParticipant } from "@/lib/server/services/participants";
import { savePatientPhoto } from "@/lib/server/services/photos";
import { saveQuestionnaire } from "@/lib/server/services/questionnaire";
import { seedCamp, seedUser, syntheticPortrait, writeCredentials } from "./seed-lib";

export async function seedDev(file = ".dev-credentials.json") {
  const camp1 = await seedCamp("AMEERPET-01", "Ameerpet auto stand camp", "Ameerpet");
  const camp2 = await seedCamp("SECUNDERABAD-01", "Secunderabad station camp", "Secunderabad");
  const users = [
    await seedUser("superadmin@example.test", "Dev Super Admin", "super_admin"),
    await seedUser("doctor@example.test", "Dr Dev Admin", "admin"),
    await seedUser("doctor.ameerpet@example.test", "Dr Scoped Admin", "admin", [camp1]),
    await seedUser("assistant@example.test", "Dev Assistant", "assistant"),
  ];
  const names = ["Ravi Kumar", "Suresh Reddy", "Mohammed Imran", "Venkatesh Rao", "Srinivas Goud", "Abdul Rahman"];
  for (const [i, fullName] of names.entries()) {
    const r = await registerParticipant(
      {
        fullName, age: 28 + i * 6, mobile: `9${String(800000000 + i * 1234567)}`, driverType: i % 2 ? "cab_taxi" : "auto", workingArea: i % 2 ? "Secunderabad" : "Ameerpet",
        campId: i % 2 ? camp2 : camp1, recruitmentSource: "stand", contactPreference: "whatsapp", language: "en", screeningMode: i >= 4 ? "virtual" : "in_person",
        consents: { registration: true, screening: true, followupContact: true, whatsappReport: i % 3 === 0, photo: true, remoteImages: i >= 4, reviewNotifications: i >= 4 },
        ...(i >= 4 ? { district: "Hyderabad" as const, mandal: "Ameerpet", pincode: "500016" } : {}),
        idempotencyKey: `seed-dev-participant-${i}-000000`,
      },
      { type: "participant" },
      crypto.randomUUID(),
    );
    if (!r.replayed) {
      await savePatientPhoto(r.patientId, await syntheticPortrait(i + 1), `seed-dev-photo-${i}-0000000`, { type: "participant" }, crypto.randomUUID());
      const habit = i % 3 !== 2;
      await saveQuestionnaire(
        r.patientId,
        { habits: habit ? ["gutkha"] : ["none"], ...(habit ? { duration: "5to10", frequency: "1to3_packets", cessation_interest: "maybe" } : {}), symptoms: ["none"], alcohol: "no", medical_history: ["none"], risk_awareness: "yes", sign_awareness: "no", previous_screening: "no" },
        true,
        `seed-dev-q-${i}-000000000`,
        { type: "participant" },
        crypto.randomUUID(),
      );
    }
  }
  writeCredentials(file, { note: "DEV/TEST ONLY synthetic accounts. Add the TOTP secret to an authenticator app.", camps: { camp1, camp2 }, users: users.map(({ id: _id, ...u }) => u) });
  return { users, camp1, camp2, participants: names.length };
}

if (process.argv[1]?.endsWith("seed-dev.ts")) {
  const r = await seedDev();
  console.log(`Seeded ${r.users.length} staff, 2 camps, ${r.participants} synthetic participants. Credentials → .dev-credentials.json`);
  await closeDbForTests();
}
