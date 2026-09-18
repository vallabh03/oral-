ALTER TABLE `patients` ADD `driver_type` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `working_area` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `recruitment` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `contact_intended` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `patients` DROP COLUMN `address`;