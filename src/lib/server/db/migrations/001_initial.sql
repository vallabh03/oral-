-- 001_initial: DRIVE SAFE core schema (PRD §6). Reviewed migration; forward-only.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and length(email) between 3 and 254),
  display_name text not null check (length(display_name) between 1 and 120),
  role text not null check (role in ('super_admin', 'admin', 'assistant')),
  status text not null default 'active' check (status in ('active', 'deactivated')),
  password_hash text,
  mfa_secret_enc text,
  mfa_enabled boolean not null default false,
  mfa_last_step bigint,                    -- last accepted TOTP time-step (replay protection)
  oidc_subject text unique,
  camp_scope uuid[],                       -- null = all camps; otherwise object-level scope
  failed_logins int not null default 0,
  locked_until timestamptz,
  password_changed_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz
);

create table app_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references users(id),
  csrf_token text not null,
  mfa_verified boolean not null default false,
  auth_method text not null check (auth_method in ('password', 'oidc')),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text
);
create index app_sessions_user_active on app_sessions (user_id) where revoked_at is null;

create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table camps (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{2,24}$'),
  name text not null check (length(name) between 2 and 120),
  working_area text not null check (length(working_area) between 2 and 120),
  starts_at timestamptz,
  ends_at timestamptz,
  capacity int check (capacity is null or capacity between 1 and 100000),
  status text not null default 'planned' check (status in ('planned', 'active', 'closed', 'cancelled')),
  is_public boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence participant_seq start 1;

create table patients (
  id uuid primary key default gen_random_uuid(),
  display_id text not null unique,
  full_name text not null check (length(full_name) between 1 and 120),
  age int not null check (age between 14 and 110),
  mobile text check (mobile is null or mobile ~ '^[6-9][0-9]{9}$'),
  driver_type text not null check (driver_type in ('auto', 'cab_taxi', 'app_cab', 'other')),
  working_area text check (working_area is null or length(working_area) <= 120),
  camp_id uuid references camps(id),
  recruitment_source text not null check (recruitment_source in ('association', 'stand', 'whatsapp', 'colleague', 'poster', 'other')),
  contact_preference text not null default 'none' check (contact_preference in ('whatsapp', 'phone', 'none')),
  preferred_language text not null default 'en',
  status text not null default 'registered' check (status in (
    'registered', 'questionnaire_in_progress', 'questionnaire_completed', 'checked_in',
    'exam_recorded', 'verified', 'report_ready', 'follow_up_due', 'withdrawn')),
  habit_present boolean,
  questionnaire_completed_at timestamptz,
  group_code smallint check (group_code between 1 and 4),
  pathway text,
  classified_at timestamptz,
  created_via text not null check (created_via in ('self', 'camp_assisted')),
  created_by uuid references users(id),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patients_recent on patients (created_at desc, id desc);
create index patients_camp_status on patients (camp_id, status);
create index patients_mobile on patients (mobile) where mobile is not null;
create index patients_name_lower on patients (lower(full_name));

create table consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  consent_type text not null check (consent_type in ('registration', 'screening', 'whatsapp_report', 'followup_contact', 'photo')),
  status text not null check (status in ('granted', 'withdrawn')),
  policy_version text not null,
  policy_text_sha256 text not null,
  language text not null,
  actor_type text not null check (actor_type in ('participant', 'staff')),
  actor_user_id uuid references users(id),
  created_at timestamptz not null default clock_timestamp()
);
create index consents_current on consents (patient_id, consent_type, created_at desc);

create table intake_tokens (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  token_hash text not null unique,
  kind text not null check (kind in ('intake', 'qr')),
  expires_at timestamptz,
  revoked_at timestamptz,
  use_count int not null default 0,
  created_at timestamptz not null default now()
);
create index intake_tokens_patient on intake_tokens (patient_id, kind);

create table intake_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  patient_id uuid not null references patients(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table questionnaire_submissions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  protocol_id text not null,
  protocol_version text not null,
  status text not null check (status in ('in_progress', 'completed')),
  actor_type text not null check (actor_type in ('participant', 'staff')),
  actor_user_id uuid references users(id),
  idempotency_key text unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index questionnaire_one_completed on questionnaire_submissions (patient_id, protocol_id) where status = 'completed';

create table questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references questionnaire_submissions(id),
  question_id text not null,
  question_text text not null,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

create table checkins (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  camp_id uuid references camps(id),
  checked_in_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create unique index checkins_once_per_camp on checkins (patient_id, coalesce(camp_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table exam_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  version int not null,
  supersedes_id uuid references exam_records(id),
  status text not null check (status in ('draft', 'verified')),
  exam_completed text not null check (exam_completed in ('yes', 'unable_or_refused')),
  mouth_opening text check (mouth_opening in ('normal', 'restricted')),
  inter_incisor_mm numeric(4,1) check (inter_incisor_mm is null or inter_incisor_mm between 0 and 90),
  oral_findings text[] not null default '{}',
  lesion_sites text[] not null default '{}',
  lesion_present text check (lesion_present in ('yes', 'no', 'uncertain')),
  clinical_impression text check (clinical_impression in ('normal', 'benign', 'pmod', 'suspicious', 'uncertain')),
  notes text check (notes is null or length(notes) <= 2000),
  correction_reason text check (correction_reason is null or length(correction_reason) between 5 and 500),
  recorded_by uuid not null references users(id),
  recorded_at timestamptz not null default now(),
  verified_by uuid references users(id),
  verified_at timestamptz,
  unique (patient_id, version)
);

-- FR-CLI-04: verified examinations are immutable. Corrections insert a new version.
create function exam_records_block_verified_mutation() returns trigger language plpgsql as $$
begin
  if old.status = 'verified' then
    raise exception 'verified examination records are immutable' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger exam_records_immutable before update or delete on exam_records
  for each row execute function exam_records_block_verified_mutation();

create table classifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  exam_record_id uuid not null unique references exam_records(id),
  habit_present boolean not null,
  lesion_present boolean not null,
  group_code smallint not null check (group_code between 1 and 4),
  pathway text not null,
  clinical_impression text,
  computed_by uuid not null references users(id),
  computed_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  classification_id uuid not null references classifications(id),
  version int not null,
  snapshot jsonb not null,
  generated_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (patient_id, version)
);

create table follow_up_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  referral_required text not null check (referral_required in ('no', 'planned_routine', 'priority')),
  referral_destination text check (referral_destination in ('government_hospital', 'haoc_specialist', 'preferred_doctor', 'other')),
  follow_up_required boolean not null,
  due_date date,
  contact_outcome text check (contact_outcome in ('contacted', 'no_answer', 'wrong_number')),
  referral_outcome text check (referral_outcome in ('planned', 'attended', 'did_not_attend', 'declined', 'unable_to_contact', 'pending')),
  cessation_outcome text check (cessation_outcome in ('interested_referred', 'not_interested', 'not_applicable', 'unknown')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  report_id uuid not null references reports(id),
  idempotency_key text not null unique,
  status text not null check (status in ('submitted', 'accepted', 'delivered', 'read', 'failed')),
  provider_message_id text unique,
  error_category text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Participant identity photos (consented). Bytes live in object storage
-- (S3 in production, or the blob_objects table / local disk in development);
-- this table is the system of record that links each photo to its patient.
create table patient_photos (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  consent_id uuid not null references consents(id),
  storage_driver text not null check (storage_driver in ('db', 'local', 's3')),
  object_key text not null unique,
  thumb_key text not null unique,
  mime text not null check (mime = 'image/webp'),
  bytes int not null check (bytes > 0),
  thumb_bytes int not null check (thumb_bytes > 0),
  width int not null,
  height int not null,
  sha256 text not null,
  captured_by_type text not null check (captured_by_type in ('participant', 'staff')),
  captured_by_user uuid references users(id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  superseded_at timestamptz
);
create index patient_photos_current on patient_photos (patient_id, created_at desc) where superseded_at is null;

create table blob_objects (
  key text primary key,
  content_type text not null,
  bytes int not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

create table audit_events (
  seq bigserial primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_type text not null check (actor_type in ('staff', 'participant', 'system', 'anonymous')),
  actor_id text,
  action text not null,
  target_type text,
  target_ref text,
  outcome text not null check (outcome in ('success', 'denied', 'failure')),
  correlation_id text not null,
  code text,
  details jsonb not null default '{}',
  is_demo boolean not null default false,
  prev_hmac text not null,
  hmac text not null
);
create index audit_events_time on audit_events (occurred_at desc);
create index audit_events_actor on audit_events (actor_id, occurred_at desc);
create index audit_events_target on audit_events (target_ref);

create function audit_events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only' using errcode = 'P0001';
end $$;
create trigger audit_events_no_mutation before update or delete on audit_events
  for each row execute function audit_events_append_only();

create table rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  count int not null
);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table app_errors (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  category text not null,
  code text not null,
  route text,
  correlation_id text
);

create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  name text not null,
  email text not null,
  topic text not null,
  message text not null,
  email_status text not null default 'queued' check (email_status in ('queued', 'sent', 'failed')),
  email_error_category text,
  created_at timestamptz not null default now()
);

create table analytics_events (
  id bigserial primary key,
  name text not null,
  path text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  occurred_at timestamptz not null default now()
);
create index analytics_events_name_time on analytics_events (name, occurred_at);

create table exports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references users(id),
  kind text not null,
  filters jsonb not null,
  fields text[] not null,
  row_count int not null,
  created_at timestamptz not null default now()
);
