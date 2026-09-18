CREATE TRIGGER reports_match_patient_insert BEFORE INSERT ON reports
WHEN NOT EXISTS (SELECT 1 FROM samples WHERE id=NEW.sample_id AND patient_id=NEW.patient_id)
BEGIN SELECT RAISE(ABORT,'Report patient must match sample patient'); END;
--> statement-breakpoint
CREATE TRIGGER reports_match_patient_update BEFORE UPDATE OF patient_id,sample_id ON reports
WHEN NOT EXISTS (SELECT 1 FROM samples WHERE id=NEW.sample_id AND patient_id=NEW.patient_id)
BEGIN SELECT RAISE(ABORT,'Report patient must match sample patient'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit
BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit
BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER consent_no_update BEFORE UPDATE ON consents
BEGIN SELECT RAISE(ABORT,'Record a new consent event'); END;
--> statement-breakpoint
CREATE TRIGGER consent_no_delete BEFORE DELETE ON consents
BEGIN SELECT RAISE(ABORT,'Consent history is append-only'); END;
--> statement-breakpoint
CREATE UNIQUE INDEX patients_case_insensitive_duplicate ON patients (tenant,lower(name),phone) WHERE phone<>'';
