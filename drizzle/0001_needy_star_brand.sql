CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`trainer_id` text NOT NULL,
	`title` text NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trainer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_review_status" CHECK("evidence"."review_status" IN ('pending','passed','failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_trainer` ON `evidence` (`trainer_id`);--> statement-breakpoint
CREATE TABLE `evidence_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_id` text NOT NULL,
	`version_id` text NOT NULL,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`reviewed_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `evidence_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_reviews_evidence` ON `evidence_reviews` (`evidence_id`);--> statement-breakpoint
CREATE TABLE `evidence_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`original_filename` text NOT NULL,
	`byte_size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_versions_object_key_unique` ON `evidence_versions` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_evidence_versions_number` ON `evidence_versions` (`evidence_id`,`version_number`);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_updated_at` integer;