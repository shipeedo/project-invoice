CREATE TABLE `credit_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`thread_id` text,
	`created_by_id` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`carrier_decision` text,
	`subject` text NOT NULL,
	`recipient_email` text NOT NULL,
	`message` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`root_message_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `email_threads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`root_message_id`) REFERENCES `mailbox_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `email_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`domain` text,
	`supplier_id` text,
	`message_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_contacts_org_email_unique` ON `email_contacts` (`organization_id`,`email`);--> statement-breakpoint
CREATE TABLE `email_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`graph_conversation_id` text,
	`subject` text,
	`supplier_id` text,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_threads_org_conversation_unique` ON `email_threads` (`organization_id`,`graph_conversation_id`);--> statement-breakpoint
CREATE TABLE `mailbox_message_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`graph_attachment_id` text,
	`file_name` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text,
	`size` integer,
	`is_inline` integer DEFAULT false NOT NULL,
	`content_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `mailbox_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mailbox_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`graph_message_id` text NOT NULL,
	`internet_message_id` text,
	`direction` text NOT NULL,
	`from_email` text,
	`from_name` text,
	`to_emails` text DEFAULT '[]' NOT NULL,
	`cc_emails` text DEFAULT '[]' NOT NULL,
	`subject` text,
	`body_html` text,
	`body_text` text,
	`received_at` integer,
	`sent_by_user_id` text,
	`supplier_id` text,
	`invoice_id` text,
	`has_attachments` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `email_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sent_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_messages_org_graph_message_unique` ON `mailbox_messages` (`organization_id`,`graph_message_id`);