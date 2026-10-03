CREATE TABLE `department_action_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`object_key` text NOT NULL,
	`original_filename` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`action_id`) REFERENCES `department_actions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `department_action_evidence_object_key_unique` ON `department_action_evidence` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_department_action_evidence_action` ON `department_action_evidence` (`action_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `department_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`category` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`expected_result` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`target_date` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_department_action_kind" CHECK("department_actions"."kind" IN ('initiative','improvement')),
	CONSTRAINT "valid_department_action_status" CHECK("department_actions"."status" IN ('planned','in_progress','completed'))
);
--> statement-breakpoint
CREATE INDEX `idx_department_actions_kind` ON `department_actions` (`kind`,`created_at`);