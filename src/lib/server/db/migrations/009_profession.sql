-- Registration asks for profession (2026-11-01): students and employees as well as drivers.
-- The column keeps its name; existing driver values stay valid.
alter table patients drop constraint patients_driver_type_check;
alter table patients add constraint patients_driver_type_check check (driver_type in ('auto', 'cab_taxi', 'app_cab', 'student', 'employee', 'other'));
