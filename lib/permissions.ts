export const permissions = [
  "patients.read",
  "patients.write",
  "clinical.write",
  "samples.write",
  "reports.write",
  "reports.patient",
  "analytics.read",
  "users.manage",
  "settings.manage",
  "audit.read",
  "backup.export",
  "qr.manage",
] as const;
export type Permission = (typeof permissions)[number];
export const rolePermissions: Record<string, readonly Permission[]> = {
  DOCTOR_ADMIN: [
    "patients.read",
    "patients.write",
    "clinical.write",
    "samples.write",
    "reports.write",
    "reports.patient",
    "analytics.read",
  ],
  SUPER_ADMIN: permissions.filter((p) => p !== "clinical.write"),
  ASSISTANT: ["patients.read", "analytics.read"],
  DOCTOR: ["patients.read", "clinical.write", "reports.patient"],
  LAB: ["patients.read", "samples.write", "reports.write"],
  COUNSELLOR: ["patients.read"],
  REGISTRATION: ["patients.read", "patients.write"],
  PATIENT: ["patients.read"],
  ADMIN: permissions.filter((p) => p !== "clinical.write"),
};
export function permitted(role: string, permission: Permission) {
  return !!rolePermissions[role]?.includes(permission);
}
export const sectionPermissions: Record<string, Permission> = {
  "Clinical protocol review": "clinical.write",
  Overview: "patients.read",
  Participants: "patients.read",
  Screening: "patients.read",
  "Cessation support": "patients.read",
  "Doctor referrals": "patients.read",
  "Samples & lab": "patients.read",
  Reports: "patients.read",
  "Analysis & reporting": "analytics.read",
  "Follow-ups": "patients.read",
  Camps: "settings.manage",
  "Protocol & settings": "settings.manage",
  "System administration": "settings.manage",
  "Audit log": "audit.read",
};
export function sectionAllowed(role: string, section: string) {
  const p = sectionPermissions[section];
  return !!p && permitted(role, p);
}
export function dashboardPath(role: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN"
    ? "/workspace/super-admin"
    : role === "DOCTOR_ADMIN" || role === "DOCTOR"
      ? "/workspace/doctor"
      : role === "ASSISTANT"
        ? "/workspace/assistant"
        : "/workspace/restricted";
}
export const actionPermissions: Record<string, Permission> = {
  register: "patients.write",
  camp: "settings.manage",
  protocol: "settings.manage",
  approveProtocol: "clinical.write",
  user: "users.manage",
  lookup: "patients.read",
  qr: "qr.manage",
  screen: "patients.write",
  examination: "clinical.write",
  consent: "patients.write",
  assign: "users.manage",
  sample: "samples.write",
  sampleStatus: "samples.write",
  verifyReport: "reports.write",
  linkReport: "reports.write",
};
