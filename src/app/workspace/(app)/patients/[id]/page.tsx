import { notFound } from "next/navigation";
import crypto from "node:crypto";
import { requireStaff } from "@/lib/server/pageAuth";
import { patientDetail } from "@/lib/server/services/records";
import { AppError } from "@/lib/server/errors";
import { can } from "@/lib/server/authz";
import { config, whatsappConfigured } from "@/lib/server/config";
import { PatientRecord } from "@/components/client/PatientRecord";

export const metadata = { title: "Participant record" };

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("patient.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let data;
  try {
    data = await patientDetail(staff, id, crypto.randomUUID());
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const perms = {
    clinical: can(staff.role, "exam.write"),
    photo: can(staff.role, "patient.photo.write"),
    whatsapp: can(staff.role, "whatsapp.send") && whatsappConfigured(),
    clinicalImages: can(staff.role, "clinical_image.view") && config().CLINICAL_IMAGES_ENABLED,
  };
  // Serialise to plain JSON (dates → strings) for the client component.
  return <PatientRecord data={JSON.parse(JSON.stringify(data))} perms={perms} />;
}
