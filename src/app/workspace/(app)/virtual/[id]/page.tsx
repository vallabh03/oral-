import { notFound } from "next/navigation";
import crypto from "node:crypto";
import { requireStaff } from "@/lib/server/pageAuth";
import { AppError } from "@/lib/server/errors";
import { caseDetail } from "@/lib/server/services/virtual";
import { VirtualCaseReview } from "@/components/client/VirtualCaseReview";

export const metadata = { title: "Virtual case review" };

export default async function VirtualCasePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("virtual.review");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let data;
  try {
    data = await caseDetail(staff, id, crypto.randomUUID());
  } catch (e) {
    if (e instanceof AppError && (e.status === 404 || e.status === 503)) notFound();
    throw e;
  }
  // Serialise to plain JSON (dates → strings) for the client component.
  return <VirtualCaseReview initial={JSON.parse(JSON.stringify(data))} />;
}
