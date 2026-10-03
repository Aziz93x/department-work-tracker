CREATE TABLE `rayat_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`term` text,
	`normalized_term` text,
	`original_filename` text NOT NULL,
	`object_key` text NOT NULL,
	`byte_size` integer NOT NULL,
	`summary` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_rayat_active" CHECK("rayat_reports"."active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rayat_reports_object_key_unique` ON `rayat_reports` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_rayat_kind_term` ON `rayat_reports` (`kind`,`normalized_term`,`created_at`);