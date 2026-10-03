ALTER TABLE `profiles` ADD `staff_number` text;--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_staff_number_unique` ON `profiles` (`staff_number`);