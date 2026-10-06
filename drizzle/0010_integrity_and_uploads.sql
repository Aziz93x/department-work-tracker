CREATE TABLE `upload_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`scope` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_upload_requests_actor` ON `upload_requests` (`actor_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `staff_key` text GENERATED ALWAYS AS (ltrim(staff_number, '0')) VIRTUAL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_profiles_staff_canonical` ON `profiles` (`staff_key`);--> statement-breakpoint
ALTER TABLE `trainer_work_records` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `trainer_work_records` ADD `created_at` integer DEFAULT 0 NOT NULL;