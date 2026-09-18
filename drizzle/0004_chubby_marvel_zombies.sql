DROP INDEX `patients_duplicate`;--> statement-breakpoint
CREATE INDEX `patients_lookup` ON `patients` (`tenant`,`name`,`phone`);