-- 004_virtual_screening: remote registration with patient-captured mouth images, doctor review
-- and patient notifications (PRD addendum: virtual registration). Forward-only, reviewed migration.

-- Location for virtual participants (data minimisation: district/mandal/PIN; full address optional).
alter table patients add column district text check (district is null or length(district) between 2 and 60);
alter table patients add column mandal text check (mandal is null or length(mandal) between 2 and 80);
alter table patients add column pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$');
alter table patients add column address_line text check (address_line is null or length(address_line) <= 300);

-- New consents: patient-submitted mouth images, and notifications about the remote review.
alter table consents drop constraint consents_consent_type_check;
alter table consents add constraint consents_consent_type_check check (consent_type in (
  'registration', 'screening', 'whatsapp_report', 'followup_contact', 'photo', 'clinical_photo', 'clinical_photo_face',
  'remote_images', 'review_notifications'));

-- One remote screening case per virtual participant.
create table virtual_cases (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references patients(id),
  status text not null default 'awaiting_images' check (status in (
    'awaiting_images', 'submitted', 'in_review', 'more_images_requested', 'reviewed', 'closed')),
  round int not null default 1 check (round between 1 and 20),
  submitted_at timestamptz,
  assistance_requested_at timestamptz,
  assistance_note text check (assistance_note is null or length(assistance_note) <= 500),
  outcome text check (outcome in ('no_suspicious', 'suspicious', 'inconclusive')),
  outcome_notes text check (outcome_notes is null or length(outcome_notes) <= 4000),
  next_steps text check (next_steps is null or length(next_steps) <= 2000),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index virtual_cases_queue on virtual_cases (status, submitted_at);

-- Patient-captured mouth images. Bytes live in the clinical object store (private S3 + KMS in
-- production); this table links each image to its case, view and submission round.
create table virtual_images (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references virtual_cases(id),
  patient_id uuid not null references patients(id),
  view text not null check (view in (
    'lips', 'upper_gums', 'lower_gums', 'cheek_left', 'cheek_right', 'tongue_top', 'tongue_under', 'palate', 'concern')),
  round int not null,
  consent_id uuid not null references consents(id),
  captured_by text not null check (captured_by in ('patient', 'caregiver')),
  storage_driver text not null check (storage_driver in ('db', 'local', 's3')),
  object_key text not null unique,
  preview_key text not null unique,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes int not null check (bytes > 0),
  width int not null,
  height int not null,
  sha256 text not null,
  metadata_removed text[] not null default '{}',
  quality jsonb not null default '{}',
  submitted boolean not null default false,
  review_status text not null default 'pending' check (review_status in ('pending', 'acceptable', 'needs_retake')),
  review_note text check (review_note is null or length(review_note) <= 500),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index virtual_images_case on virtual_images (case_id, round, view) where removed_at is null;

-- Short-lived upload tickets: the browser uploads to a quarantine key (presigned S3 PUT in
-- production), then asks the server to validate and promote it.
create table virtual_upload_tickets (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  case_id uuid not null references virtual_cases(id),
  view text not null,
  captured_by text not null check (captured_by in ('patient', 'caregiver')),
  quarantine_key text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  image_id uuid references virtual_images(id),
  created_at timestamptz not null default now()
);
create index virtual_upload_tickets_patient on virtual_upload_tickets (patient_id, created_at desc);

-- Every review decision is kept (the case row holds the latest).
create table virtual_reviews (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references virtual_cases(id),
  round int not null,
  decision text not null check (decision in ('no_suspicious', 'suspicious', 'inconclusive', 'more_images')),
  inconclusive_action text check (inconclusive_action in ('more_images', 'in_person')),
  notes text check (notes is null or length(notes) <= 4000),
  next_steps text check (next_steps is null or length(next_steps) <= 2000),
  reviewed_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index virtual_reviews_case on virtual_reviews (case_id, created_at);

-- Follow-up actions recorded by the doctor after review.
create table virtual_followups (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references virtual_cases(id),
  action text not null check (action in ('called', 'no_answer', 'appointment_booked', 'attended', 'did_not_attend', 'referred', 'closed', 'note')),
  note text check (note is null or length(note) <= 1000),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- Patient notifications (WhatsApp first; SMS fallback when configured). The outbox row is
-- written in the same transaction as the decision that triggers it; a dispatcher sends it.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  case_id uuid references virtual_cases(id),
  template text not null,
  channel text not null check (channel in ('whatsapp', 'sms')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text unique,
  last_error text check (last_error is null or length(last_error) <= 200),
  idempotency_key text not null unique,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_due on notifications (status, next_attempt_at);
create index notifications_patient on notifications (patient_id, created_at desc);

-- One-time login codes for returning virtual participants (stored hashed only).
create table participant_otps (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index participant_otps_patient on participant_otps (patient_id, created_at desc);
