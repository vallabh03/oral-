-- The photo guide is optional (2026-11-01): record whether the patient watched it or skipped it.
alter table virtual_cases add column tutorial_skipped boolean not null default false;
