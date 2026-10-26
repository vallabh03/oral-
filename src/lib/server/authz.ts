import "server-only";
import type { Role } from "@/lib/shared/constants";

// Server-side permission matrix (PRD §3.3). The UI may hide controls, but these checks
// are the only thing that grants access.
export const PERMISSIONS = {
  "patient.search": ["admin", "super_admin"],
  "patient.read": ["admin", "super_admin"],
  "patient.create": ["admin"],
  "patient.photo.read": ["admin", "super_admin"],
  "patient.photo.write": ["admin"],
  "checkin.write": ["admin"],
  "questionnaire.assist": ["admin"],
  "exam.write": ["admin"],
  "exam.verify": ["admin"],
  "report.generate": ["admin"],
  "report.read": ["admin", "super_admin"],
  "whatsapp.send": ["admin"],
  "followup.write": ["admin"],
  "consent.withdraw": ["admin"],
  "analytics.read": ["admin", "super_admin", "assistant"],
  "export.deidentified": ["super_admin", "assistant"],
  "users.manage": ["super_admin"],
  "camps.manage": ["super_admin"],
  "sessions.revoke": ["super_admin"],
  "audit.read": ["super_admin"],
  "errors.read": ["super_admin"],
  "settings.manage": ["super_admin"],
  // Clinical lesion images (PRD v1.2 §3): Doctor Admin only. Super Admin and Assistant get no
  // access by default, regardless of platform-management rights.
  "clinical_image.capture": ["admin"],
  "clinical_image.view": ["admin"],
  "clinical_image.delete": ["admin"],
  // Virtual screening review (PRD addendum §3): only doctors record or approve clinical findings.
  "virtual.review": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Object-level scope: staff restricted to camps may only touch patients in those camps. */
export function inCampScope(campScope: string[] | null, patientCampId: string | null): boolean {
  if (campScope === null) return true;
  return patientCampId !== null && campScope.includes(patientCampId);
}

export const DASHBOARD_FOR_ROLE: Record<Role, string> = {
  super_admin: "/workspace/super-admin",
  admin: "/workspace/admin",
  assistant: "/workspace/assistant",
};
