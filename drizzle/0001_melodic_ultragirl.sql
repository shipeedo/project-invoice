CREATE TABLE `invoice_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text,
	`size` integer,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `o365_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`microsoft_tenant_id` text,
	`access_token_encrypted` text,
	`refresh_token_encrypted` text,
	`token_expires_at` integer,
	`selected_mailbox_id` text,
	`selected_mailbox_upn` text,
	`status` text DEFAULT 'DISCONNECTED' NOT NULL,
	`last_error` text,
	`last_synced_at` integer,
	`connected_by_id` text,
	`connected_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `o365_connections_organization_id_unique` ON `o365_connections` (`organization_id`);--> statement-breakpoint
CREATE TABLE `processed_o365_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`message_id` text NOT NULL,
	`invoice_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `processed_o365_messages_org_message_unique` ON `processed_o365_messages` (`organization_id`,`message_id`);--> statement-breakpoint
ALTER TABLE `invoices` ADD `source_message_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `email_subject` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `email_from` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `email_from_name` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `email_received_at` integer;--> statement-breakpoint
ALTER TABLE `invoices` ADD `email_body_html` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `email_body_text` text;