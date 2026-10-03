CREATE TABLE `trainer_work_records` (
	`id` text PRIMARY KEY NOT NULL,
	`trainer_id` text NOT NULL,
	`course_key` text DEFAULT 'general' NOT NULL,
	`category` text NOT NULL,
	`item_key` text NOT NULL,
	`status` text DEFAULT 'not_done' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trainer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `valid_trainer_work_status` CHECK(`status` IN ('done','not_done','not_applicable'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trainer_work_unique` ON `trainer_work_records` (`trainer_id`,`course_key`,`category`,`item_key`);
--> statement-breakpoint
CREATE INDEX `idx_trainer_work_trainer` ON `trainer_work_records` (`trainer_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `trainer_work_files` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`object_key` text NOT NULL,
	`original_filename` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `trainer_work_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trainer_work_files_object_key_unique` ON `trainer_work_files` (`object_key`);
--> statement-breakpoint
CREATE INDEX `idx_trainer_work_files_record` ON `trainer_work_files` (`record_id`,`created_at`);
