CREATE TABLE `sample_events` (
	`id` text PRIMARY KEY NOT NULL,
	`sample_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`status` text NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`sample_id`,`patient_id`) REFERENCES `samples`(`id`,`patient_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sample_events_sample` ON `sample_events` (`sample_id`,`at`);
--> statement-breakpoint
INSERT INTO sample_events (id,sample_id,patient_id,status,at,actor)
SELECT 'SEV-' || id || '-0', id, patient_id, 'Collected', collected_at, collected_by FROM samples;
--> statement-breakpoint
CREATE TRIGGER sample_events_no_update BEFORE UPDATE ON sample_events
BEGIN SELECT RAISE(ABORT,'Sample events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER sample_events_no_delete BEFORE DELETE ON sample_events
BEGIN SELECT RAISE(ABORT,'Sample events are append-only'); END;
