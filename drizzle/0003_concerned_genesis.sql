CREATE TABLE `intake_tokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`protocol_id` text NOT NULL,
	`expires` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`protocol_id`) REFERENCES `protocols`(`id`) ON UPDATE no action ON DELETE no action
);
