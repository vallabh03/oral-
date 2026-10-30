-- Virtual review update (2026-10-30): a "specialist referral required" outcome and the location
-- of any suspicious visible area recorded by the doctor. Recommended views are no longer enforced
-- at submission (code change only; no schema impact).
alter table virtual_cases drop constraint virtual_cases_outcome_check;
alter table virtual_cases add constraint virtual_cases_outcome_check
  check (outcome in ('no_suspicious', 'suspicious', 'referral', 'inconclusive'));
alter table virtual_cases add column lesion_location text check (lesion_location is null or length(lesion_location) <= 200);

alter table virtual_reviews drop constraint virtual_reviews_decision_check;
alter table virtual_reviews add constraint virtual_reviews_decision_check
  check (decision in ('no_suspicious', 'suspicious', 'referral', 'inconclusive', 'more_images'));
alter table virtual_reviews add column lesion_location text check (lesion_location is null or length(lesion_location) <= 200);
