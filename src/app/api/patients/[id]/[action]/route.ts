import { z } from "zod";
import { handler, json, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { can } from "@/lib/server/authz";
import { audit } from "@/lib/server/audit";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { clinicalPhotoConsentSchema, consentWithdrawSchema, examSchema, followUpSchema, idempotencyKey, questionnaireSchema } from "@/lib/server/schemas";
import { recordClinicalPhotoConsent } from "@/lib/server/services/lesionImages";
import { checkIn, generateReport, recordExam, recordFollowUp, submitWhatsAppReport, verifyExam } from "@/lib/server/services/clinical";
import { withdrawConsent } from "@/lib/server/services/participants";
import { saveQuestionnaire } from "@/lib/server/services/questionnaire";
import { loadPatientForStaff } from "@/lib/server/services/common";
import { db } from "@/lib/server/db";
import type { Permission } from "@/lib/server/authz";

// One dispatcher for clinical mutations keeps each action's permission next to its schema.
const ACTIONS = {
  checkin: { permission: "checkin.write", schema: z.object({}).strict() },
  questionnaire: { permission: "questionnaire.assist", schema: questionnaireSchema },
  exam: { permission: "exam.write", schema: examSchema },
  verify: { permission: "exam.verify", schema: z.object({ examId: z.string().uuid() }).strict() },
  report: { permission: "report.generate", schema: z.object({}).strict() },
  followup: { permission: "followup.write", schema: followUpSchema },
  "withdraw-consent": { permission: "consent.withdraw", schema: consentWithdrawSchema },
  whatsapp: { permission: "whatsapp.send", schema: z.object({ reportId: z.string().uuid(), idempotencyKey }).strict() },
  "clinical-photo-consent": { permission: "clinical_image.capture", schema: clinicalPhotoConsentSchema },
} satisfies Record<string, { permission: Permission; schema: z.ZodTypeAny }>;

export const POST = handler(
  { auth: "staff", body: z.unknown(), rateLimit: [{ limit: LIMITS.staffWrite, by: "user" }] },
  async ({ staff, params, body, correlationId }) => {
    const id = uuidParam.safeParse(params.id);
    const action = ACTIONS[params.action as keyof typeof ACTIONS];
    if (!id.success || !action) throw Errors.notFound();
    if (!can(staff!.role, action.permission)) {
      await audit({ actorType: "staff", actorId: staff!.userId, action: "permission.denied", outcome: "denied", correlationId, code: action.permission, targetRef: id.data });
      throw Errors.forbidden();
    }
    const s = staff!;
    const pid = id.data;
    switch (params.action) {
      case "checkin":
        ACTIONS.checkin.schema.parse(body);
        return checkIn(s, pid, correlationId);
      case "questionnaire": {
        const b = ACTIONS.questionnaire.schema.parse(body);
        await loadPatientForStaff(await db(), pid, s, correlationId);
        return saveQuestionnaire(pid, b.answers, b.complete, b.idempotencyKey, { type: "staff", userId: s.userId }, correlationId);
      }
      case "exam":
        return json(await recordExam(s, pid, ACTIONS.exam.schema.parse(body), correlationId), 201);
      case "verify":
        return verifyExam(s, pid, ACTIONS.verify.schema.parse(body).examId, correlationId);
      case "report":
        ACTIONS.report.schema.parse(body);
        return json(await generateReport(s, pid, correlationId), 201);
      case "followup":
        return json(await recordFollowUp(s, pid, ACTIONS.followup.schema.parse(body), correlationId), 201);
      case "withdraw-consent": {
        await loadPatientForStaff(await db(), pid, s, correlationId);
        await withdrawConsent(pid, ACTIONS["withdraw-consent"].schema.parse(body).consentType, { type: "staff", staff: s }, correlationId);
        return { ok: true };
      }
      case "clinical-photo-consent":
        return recordClinicalPhotoConsent(s, pid, ACTIONS["clinical-photo-consent"].schema.parse(body), correlationId);
      case "whatsapp": {
        const b = ACTIONS.whatsapp.schema.parse(body);
        return submitWhatsAppReport(s, pid, b.reportId, b.idempotencyKey, correlationId);
      }
    }
    throw Errors.notFound();
  },
);
