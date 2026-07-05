ALTER TABLE `users` ADD `has_access` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Grandfather existing users: anyone already provisioned keeps access.
UPDATE `users` SET `has_access` = true;
