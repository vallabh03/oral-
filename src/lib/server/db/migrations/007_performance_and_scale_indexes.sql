-- 007_performance_and_scale_indexes: High-load performance and scaling optimization.
-- Adds covering indexes for high-frequency queries, queue filtering, keyset pagination,
-- and background maintenance purge routines under heavy concurrent load.

-- 1. Accelerates patient detail view and de-identified export lateral join
create index if not exists classifications_patient on classifications (patient_id, computed_at desc);

-- 2. Eliminates full table scans in patient detail timeline
create index if not exists follow_up_events_patient on follow_up_events (patient_id, created_at desc);
create index if not exists whatsapp_messages_patient on whatsapp_messages (patient_id, created_at desc);
create index if not exists whatsapp_messages_report on whatsapp_messages (report_id);

-- 3. Eliminates full table scans when doctors open virtual cases
create index if not exists virtual_followups_case on virtual_followups (case_id, created_at desc);

-- 4. Optimizes doctor review queue subqueries and patient image lookups
create index if not exists virtual_images_review_queue on virtual_images (case_id, created_at desc) where removed_at is null and submitted;
create index if not exists virtual_images_retakes on virtual_images (case_id) where removed_at is null and review_status = 'needs_retake';
create index if not exists virtual_images_current on virtual_images (case_id, view, created_at desc) where removed_at is null;

-- 5. Accelerates virtual cases queue filtering and ordering
create index if not exists virtual_cases_assistance on virtual_cases (status, assistance_requested_at) where assistance_requested_at is not null;
create index if not exists virtual_cases_submitted on virtual_cases (status, submitted_at, created_at);

-- 6. Accelerates questionnaire loading across all intake and clinical pages
create index if not exists questionnaire_submissions_patient on questionnaire_submissions (patient_id, started_at desc);

-- 7. Accelerates 30-day analytics aggregation
create index if not exists analytics_events_occurred on analytics_events (occurred_at desc, name);

-- 8. Accelerates camp and status filtered patient search pagination
create index if not exists patients_camp_recent on patients (camp_id, created_at desc, id desc);
create index if not exists patients_status_recent on patients (status, created_at desc, id desc);

-- 9. Housekeeping indexes for periodic expiration cleanup under high load
create index if not exists rate_limits_window_start on rate_limits (window_start);
create index if not exists app_sessions_expires on app_sessions (expires_at);
create index if not exists intake_sessions_expires on intake_sessions (expires_at);
create index if not exists participant_otps_expires on participant_otps (expires_at);
create index if not exists virtual_upload_tickets_expires on virtual_upload_tickets (expires_at);
