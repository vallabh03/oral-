-- Virtual registration update (2026-10-30): five required views (front, left, right, upper mouth,
-- lower mouth), a mandatory photo-guide video before capture, and the patient timeline.
alter table virtual_images drop constraint virtual_images_view_check;
alter table virtual_images add constraint virtual_images_view_check check (view in (
  'lips', 'cheek_left', 'cheek_right', 'upper_mouth', 'lower_mouth', 'concern',
  'upper_gums', 'lower_gums', 'tongue_top', 'tongue_under', 'palate'));

-- Watching the guide is recorded for the timeline only; it is not consent.
alter table virtual_cases add column tutorial_completed_at timestamptz;
alter table virtual_cases add column tutorial_language text check (tutorial_language in ('en', 'te', 'hi'));
alter table virtual_cases add column tutorial_version text check (tutorial_version is null or length(tutorial_version) <= 40);
-- Per submission round: all required photos saved, then confirmed readable in storage at submit.
alter table virtual_cases add column photos_captured_at timestamptz;
alter table virtual_cases add column uploads_confirmed_at timestamptz;
alter table virtual_cases add column review_started_at timestamptz;
