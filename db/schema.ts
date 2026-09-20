import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const camps = sqliteTable("camps", {
  id: text("id").primaryKey(),
  tenant: text("tenant").notNull(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  date: text("date").notNull(),
});
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  active: integer("active").notNull().default(1),
  patientId: text("patient_id"),
});
export const languagePreferences = sqliteTable("language_preferences", {
  userId: text("user_id").primaryKey(),
  locale: text("locale").notNull(),
});
export const patients = sqliteTable(
  "patients",
  {
    id: text("id").primaryKey(),
    tenant: text("tenant").notNull(),
    name: text("name").notNull(),
    preferredLanguage: text("preferred_language").notNull().default("en"),
    phone: text("phone").notNull(),
    driverType: text("driver_type"),
    workingArea: text("working_area"),
    recruitment: text("recruitment"),
    contactIntended: integer("contact_intended").notNull().default(0),
    age: integer("age"),
    campId: text("camp_id").references(() => camps.id),
    createdAt: text("created_at").notNull(),
    category: text("category"),
    pathway: text("pathway").notNull().default("Awaiting screening"),
    doctorId: text("doctor_id"),
    counsellorId: text("counsellor_id"),
    qrHash: text("qr_hash"),
    demo: integer("demo").notNull().default(0),
  },
  (t) => [
    index("patients_tenant").on(t.tenant),
    index("patients_assignments").on(t.doctorId, t.counsellorId),
    index("patients_lookup").on(t.tenant, t.name, t.phone),
    uniqueIndex("patients_qr").on(t.qrHash),
  ],
);
export const consents = sqliteTable(
  "consents",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id")
      .notNull()
      .references(() => patients.id),
    type: text("type").notNull(),
    status: text("status").notNull(),
    version: text("version").notNull(),
    at: text("at").notNull(),
    actor: text("actor").notNull(),
    method: text("method").notNull(),
  },
  (t) => [index("consents_patient").on(t.patientId, t.type, t.at)],
);
export const protocols = sqliteTable(
  "protocols",
  {
    id: text("id").primaryKey(),
    tenant: text("tenant").notNull(),
    version: text("version").notNull(),
    definition: text("definition").notNull(),
    status: text("status").notNull(),
    createdBy: text("created_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
  },
  (t) => [index("protocols_tenant").on(t.tenant, t.status)],
);
export const responses = sqliteTable(
  "responses",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id")
      .notNull()
      .references(() => patients.id),
    protocolId: text("protocol_id")
      .notNull()
      .references(() => protocols.id),
    questionId: text("question_id").notNull(),
    questionText: text("question_text").notNull(),
    version: text("version").notNull(),
    answer: text("answer").notNull(),
    at: text("at").notNull(),
    actor: text("actor").notNull(),
  },
  (t) => [index("responses_patient").on(t.patientId)],
);
export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id")
      .notNull()
      .references(() => patients.id),
    kind: text("kind").notNull(),
    data: text("data").notNull(),
    status: text("status").notNull(),
    at: text("at").notNull(),
    actor: text("actor").notNull(),
  },
  (t) => [index("records_patient").on(t.patientId, t.kind)],
);
export const samples = sqliteTable(
  "samples",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id")
      .notNull()
      .references(() => patients.id),
    type: text("type").notNull(),
    status: text("status").notNull(),
    collectedAt: text("collected_at").notNull(),
    collectedBy: text("collected_by").notNull(),
    location: text("location").notNull(),
    labId: text("lab_id"),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [
    uniqueIndex("samples_identity").on(t.id, t.patientId),
    index("samples_patient").on(t.patientId),
    index("samples_lab").on(t.labId),
  ],
);
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    sampleId: text("sample_id")
      .notNull()
      .references(() => samples.id),
    patientId: text("patient_id")
      .notNull()
      .references(() => patients.id),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    status: text("status").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    at: text("at").notNull(),
    verifiedBy: text("verified_by"),
    linkedBy: text("linked_by"),
  },
  (t) => [
    index("reports_patient").on(t.patientId),
    index("reports_sample").on(t.sampleId),
  ],
);
export const audit = sqliteTable(
  "audit",
  {
    id: text("id").primaryKey(),
    tenant: text("tenant").notNull(),
    patientId: text("patient_id"),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    at: text("at").notNull(),
    signature: text("signature").notNull(),
  },
  (t) => [
    index("audit_tenant").on(t.tenant, t.at),
    index("audit_patient").on(t.patientId, t.at),
  ],
);
export const limits = sqliteTable("limits", {
  id: text("id").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});
export const intakeTokens = sqliteTable("intake_tokens", {
  hash: text("hash").primaryKey(),
  patientId: text("patient_id")
    .notNull()
    .references(() => patients.id),
  protocolId: text("protocol_id")
    .notNull()
    .references(() => protocols.id),
  expires: integer("expires").notNull(),
  used: integer("used").notNull().default(0),
});

// Append-only lifecycle history: one row per sample status change.
export const sampleEvents = sqliteTable(
  "sample_events",
  {
    id: text("id").primaryKey(),
    sampleId: text("sample_id").notNull(),
    patientId: text("patient_id").notNull(),
    status: text("status").notNull(),
    at: text("at").notNull(),
    actor: text("actor").notNull(),
  },
  (t) => [index("sample_events_sample").on(t.sampleId, t.at)],
);

export const appSessions = sqliteTable("app_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
  lastSeen: integer("last_seen").notNull(),
  expiresAt: integer("expires_at").notNull(),
  revoked: integer("revoked").notNull().default(0),
});
export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const appErrors = sqliteTable("app_errors", {
  id: text("id").primaryKey(),
  at: text("at").notNull(),
  code: text("code").notNull(),
});
