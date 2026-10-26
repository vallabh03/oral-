import { describe, expect, it } from "vitest";
import { call, randomIp, registerParticipant, registration, req, seedCamp, staffJar } from "../helpers";
import * as register from "@/app/api/intake/register/route";
import * as patients from "@/app/api/patients/route";
import * as patient from "@/app/api/patients/[id]/route";
import { dashboardCounts } from "@/lib/server/services/admin";
import type { StaffSession } from "@/lib/server/security/session";

const VIRTUAL = { screeningMode: "virtual", district: "Hyderabad", pincode: "500016", consents: { registration: true, screening: true, followupContact: true, whatsappReport: false, photo: false, remoteImages: true, reviewNotifications: true } };

describe("in-person and virtual screening are recorded and listed separately", () => {
  it("defaults to in person, records virtual, and filters each list to its own participants", async () => {
    const camp = await seedCamp("MODE-01", "Mode camp", "Ameerpet");
    const inPerson = await registerParticipant({ campId: camp });
    const virtual = await registerParticipant({ campId: camp, ...VIRTUAL });
    const { jar: doc } = await staffJar("admin");
    const session = { campScope: null } as unknown as StaffSession; // unscoped staff view of the counts

    const list = async (mode?: string) =>
      (await call(patients.GET, req("GET", `/api/patients?campId=${camp}&limit=50${mode ? `&mode=${mode}` : ""}`, { jar: doc }))).json.items as { id: string; screeningMode: string }[];

    const all = await list();
    expect(all.find((p) => p.id === inPerson.patientId)?.screeningMode).toBe("in_person");
    expect(all.find((p) => p.id === virtual.patientId)?.screeningMode).toBe("virtual");

    const onlyVirtual = await list("virtual");
    expect(onlyVirtual.map((p) => p.id)).toEqual([virtual.patientId]);
    const onlyInPerson = await list("in_person");
    expect(onlyInPerson.map((p) => p.id)).toEqual([inPerson.patientId]);

    const detail = await call(patient.GET, req("GET", `/api/patients/${virtual.patientId}`, { jar: doc }), { id: virtual.patientId });
    expect(detail.json.patient.screeningMode).toBe("virtual");

    const { counts } = await dashboardCounts(session, { campId: camp });
    expect(counts).toMatchObject({ registered: 2, in_person: 1, virtual: 1 });
    expect((await dashboardCounts(session, { campId: camp, mode: "virtual" })).counts.registered).toBe(1);
  });

  it("requires a mobile number for virtual screening and rejects unknown screening types", async () => {
    const send = (body: unknown) => call(register.POST, req("POST", "/api/intake/register", { body, headers: { "x-forwarded-for": randomIp() } }));
    const noMobile = await send(registration({ screeningMode: "virtual", mobile: undefined, contactPreference: "none", consents: { registration: true, screening: true, followupContact: false, whatsappReport: false, photo: false } }));
    expect(noMobile.status).toBe(422);
    expect(noMobile.json.error.fields).toHaveProperty("mobile");

    const bogus = await send(registration({ screeningMode: "telepathy" }));
    expect(bogus.status).toBe(422);

    const { jar: doc } = await staffJar("admin");
    const badFilter = await call(patients.GET, req("GET", "/api/patients?mode=telepathy", { jar: doc }));
    expect(badFilter.status).toBe(422);
  });
});
