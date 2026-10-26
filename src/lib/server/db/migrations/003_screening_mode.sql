-- 003_screening_mode: in-person (camp) and virtual screening are tracked separately.
-- Forward-only. Existing participants were all registered for in-person screening.
alter table patients add column screening_mode text not null default 'in_person'
  check (screening_mode in ('in_person', 'virtual'));
create index patients_mode_recent on patients (screening_mode, created_at desc, id desc);
