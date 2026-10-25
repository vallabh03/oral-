-- 002_clinical_images: oral lesion image capture (PRD v1.2). Forward-only, reviewed migration.

-- Clinical photography consent is separate from registration, screening, WhatsApp and
-- identity-photo consent; "declined" records an explicit refusal (screening still continues).
alter table consents drop constraint consents_consent_type_check;
alter table consents add constraint consents_consent_type_check check (consent_type in (
  'registration', 'screening', 'whatsapp_report', 'followup_contact', 'photo', 'clinical_photo', 'clinical_photo_face'));
alter table consents drop constraint consents_status_check;
alter table consents add constraint consents_status_check check (status in ('granted', 'withdrawn', 'declined'));

-- Lesion images: clinical documentation for authorised professional review, not a diagnosis.
-- Bytes live in a private bucket (separate from reports and identity photos) under random keys;
-- this table holds the relationships and integrity data.
create table lesion_images (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  exam_record_id uuid not null references exam_records(id),
  lesion_site text not null check (lesion_site in (
    'right_buccal', 'left_buccal', 'tongue', 'floor_of_mouth', 'gb_sulcus', 'palate', 'lip', 'oropharynx', 'other')),
  consent_id uuid not null references consents(id),
  includes_face boolean not null default false,
  face_consent_id uuid references consents(id),
  storage_driver text not null check (storage_driver in ('db', 'local', 's3')),
  object_key text not null unique,
  preview_key text not null unique,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes int not null check (bytes > 0),
  width int not null check (width > 0),
  height int not null check (height > 0),
  sha256 text not null,
  metadata_removed text[] not null default '{}',
  captured_by uuid not null references users(id),
  captured_at timestamptz not null default now(),
  idempotency_key text not null unique,
  replaces_id uuid references lesion_images(id),
  deleted_at timestamptz,
  deleted_by uuid references users(id),
  delete_reason text check (delete_reason is null or length(delete_reason) between 3 and 300),
  check (not includes_face or face_consent_id is not null),
  check ((deleted_at is null) = (deleted_by is null))
);
create index lesion_images_patient on lesion_images (patient_id, captured_at desc) where deleted_at is null;
create index lesion_images_exam on lesion_images (exam_record_id) where deleted_at is null;
