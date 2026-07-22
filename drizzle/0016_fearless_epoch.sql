PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_credit_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`thread_id` text,
	`created_by_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`submitted_at` integer,
	`carrier_decision` text,
	`subject` text NOT NULL,
	`recipient_email` text NOT NULL,
	`message` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`root_message_id` text,
	`line_items` text DEFAULT '[]' NOT NULL,
	`requested_total` real,
	`gst_amount` real,
	`approved_amount` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `email_threads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`root_message_id`) REFERENCES `mailbox_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_credit_requests`("id", "organization_id", "invoice_id", "thread_id", "created_by_id", "status", "submitted_at", "carrier_decision", "subject", "recipient_email", "message", "attachments", "root_message_id", "line_items", "requested_total", "gst_amount", "approved_amount", "notes", "created_at", "updated_at") SELECT "id", "organization_id", "invoice_id", "thread_id", "created_by_id", "status", NULL, "carrier_decision", "subject", "recipient_email", "message", "attachments", "root_message_id", "line_items", "requested_total", "gst_amount", "approved_amount", "notes", "created_at", "updated_at" FROM `credit_requests`;--> statement-breakpoint
DROP TABLE `credit_requests`;--> statement-breakpoint
ALTER TABLE `__new_credit_requests` RENAME TO `credit_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;