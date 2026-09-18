CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`patient_id` text,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`at` text NOT NULL,
	`signature` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_tenant` ON `audit` (`tenant`,`at`);--> statement-breakpoint
CREATE INDEX `audit_patient` ON `audit` (`patient_id`,`at`);--> statement-breakpoint
CREATE TABLE `camps` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`version` text NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`method` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `consents_patient` ON `consents` (`patient_id`,`type`,`at`);--> statement-breakpoint
CREATE TABLE `limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`age` integer,
	`camp_id` text,
	`created_at` text NOT NULL,
	`category` text,
	`pathway` text DEFAULT 'Awaiting screening' NOT NULL,
	`doctor_id` text,
	`counsellor_id` text,
	`qr_hash` text,
	`demo` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`camp_id`) REFERENCES `camps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `patients_tenant` ON `patients` (`tenant`);--> statement-breakpoint
CREATE INDEX `patients_assignments` ON `patients` (`doctor_id`,`counsellor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `patients_duplicate` ON `patients` (`tenant`,`name`,`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `patients_qr` ON `patients` (`qr_hash`);--> statement-breakpoint
CREATE TABLE `protocols` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`version` text NOT NULL,
	`definition` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`approved_by` text,
	`approved_at` text
);
--> statement-breakpoint
CREATE INDEX `protocols_tenant` ON `protocols` (`tenant`,`status`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`status` text NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `records_patient` ON `records` (`patient_id`,`kind`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`sample_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`status` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`at` text NOT NULL,
	`verified_by` text,
	`linked_by` text,
	FOREIGN KEY (`sample_id`) REFERENCES `samples`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reports_patient` ON `reports` (`patient_id`);--> statement-breakpoint
CREATE INDEX `reports_sample` ON `reports` (`sample_id`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`protocol_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_text` text NOT NULL,
	`version` text NOT NULL,
	`answer` text NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`protocol_id`) REFERENCES `protocols`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `responses_patient` ON `responses` (`patient_id`);--> statement-breakpoint
CREATE TABLE `samples` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`collected_at` text NOT NULL,
	`collected_by` text NOT NULL,
	`location` text NOT NULL,
	`lab_id` text,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `samples_identity` ON `samples` (`id`,`patient_id`);--> statement-breakpoint
CREATE INDEX `samples_patient` ON `samples` (`patient_id`);--> statement-breakpoint
CREATE INDEX `samples_lab` ON `samples` (`lab_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`patient_id` text
);
