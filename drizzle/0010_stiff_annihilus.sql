CREATE TABLE `ai_connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connector_type` text DEFAULT 'OPENAI_COMPATIBLE' NOT NULL,
	`api_key_encrypted` text,
	`base_url` text,
	`model` text,
	`model_input_price` real,
	`model_output_price` real,
	`credits_balance` real,
	`credits_checked_at` integer,
	`configured_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`configured_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_connectors_organization_id_unique` ON `ai_connectors` (`organization_id`);--> statement-breakpoint
CREATE TABLE `escalation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`watched_user_id` text,
	`after_business_days` integer NOT NULL,
	`escalate_to_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`watched_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`escalate_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`actor_id` text,
	`invoice_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_read_idx` ON `notifications` (`recipient_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
ALTER TABLE `invoices` ADD `assigned_at` integer;--> statement-breakpoint
ALTER TABLE `processing_jobs` ADD `ai_model` text;--> statement-breakpoint
ALTER TABLE `processing_jobs` ADD `prompt_tokens` integer;--> statement-breakpoint
ALTER TABLE `processing_jobs` ADD `completion_tokens` integer;--> statement-breakpoint
ALTER TABLE `processing_jobs` ADD `cost_usd` real;--> statement-breakpoint
ALTER TABLE `users` ADD `last_notification_check_at` integer;