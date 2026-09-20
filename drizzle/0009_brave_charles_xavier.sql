CREATE TABLE `language_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`locale` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `patients` ADD `preferred_language` text DEFAULT 'en' NOT NULL;