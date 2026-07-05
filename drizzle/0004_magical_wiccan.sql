CREATE TABLE `invoice_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` real NOT NULL,
	`paid_at` integer NOT NULL,
	`recorded_by_id` text,
	`transaction_ref` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`source_type` text DEFAULT 'UPLOAD' NOT NULL,
	`source_message_id` text,
	`email_subject` text,
	`email_from` text,
	`email_from_name` text,
	`email_received_at` integer,
	`email_body_html` text,
	`email_body_text` text,
	`original_file_name` text,
	`file_path` text,
	`file_mime_type` text,
	`vendor_name` text,
	`vendor_email` text,
	`invoice_number` text,
	`invoice_date` integer,
	`due_date` integer,
	`respond_by_date` integer,
	`total_amount` real,
	`currency` text DEFAULT 'AUD',
	`line_items` text,
	`extraction_candidates` text,
	`extraction_raw` text,
	`parse_error` text,
	`supplier_id` text,
	`validated_at` integer,
	`validated_by_id` text,
	`assigned_to_id` text,
	`amount_paid` real DEFAULT 0 NOT NULL,
	`paid_at` integer,
	`marked_paid_by_id` text,
	`on_hold_at` integer,
	`on_hold_by_id` text,
	`on_hold_reason` text,
	`hold_previous_status` text,
	`cancelled_at` integer,
	`cancelled_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`validated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`marked_paid_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`on_hold_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cancelled_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_invoices`("id", "organization_id", "status", "source_type", "source_message_id", "email_subject", "email_from", "email_from_name", "email_received_at", "email_body_html", "email_body_text", "original_file_name", "file_path", "file_mime_type", "vendor_name", "vendor_email", "invoice_number", "invoice_date", "due_date", "respond_by_date", "total_amount", "currency", "line_items", "extraction_candidates", "extraction_raw", "parse_error", "supplier_id", "validated_at", "validated_by_id", "assigned_to_id", "amount_paid", "paid_at", "marked_paid_by_id", "on_hold_at", "on_hold_by_id", "on_hold_reason", "hold_previous_status", "cancelled_at", "cancelled_by_id", "created_at", "updated_at") SELECT "id", "organization_id", "status", "source_type", "source_message_id", "email_subject", "email_from", "email_from_name", "email_received_at", "email_body_html", "email_body_text", "original_file_name", "file_path", "file_mime_type", "vendor_name", "vendor_email", "invoice_number", "invoice_date", "due_date", "respond_by_date", "total_amount", "currency", "line_items", "extraction_candidates", "extraction_raw", "parse_error", "supplier_id", "validated_at", "validated_by_id", "assigned_to_id", 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, "created_at", "updated_at" FROM `invoices`;--> statement-breakpoint
DROP TABLE `invoices`;--> statement-breakpoint
ALTER TABLE `__new_invoices` RENAME TO `invoices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
UPDATE `invoices` SET `status` = CASE `status`
	WHEN 'RECEIVED' THEN 'DRAFT'
	WHEN 'PROCESSING' THEN 'DRAFT'
	WHEN 'PENDING_VALIDATION' THEN 'DRAFT'
	WHEN 'NEEDS_REVIEW' THEN 'DRAFT'
	WHEN 'PARTIALLY_APPROVED' THEN 'PENDING_APPROVAL'
	WHEN 'PARTIALLY_REJECTED' THEN 'PENDING_APPROVAL'
	WHEN 'READY_FOR_PAYMENT' THEN 'APPROVED'
	ELSE `status`
END;