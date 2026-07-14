CREATE TABLE `invoice_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`rebill_id` text,
	`uploaded_by_id` text,
	`file_name` text NOT NULL,
	`file_path` text NOT NULL,
	`mime_type` text,
	`size` integer,
	`kind` text DEFAULT 'GENERAL' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rebill_id`) REFERENCES `rebills`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rebills` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`reference` text,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text,
	`supplier_id` text,
	`document_id` text,
	`user_id` text,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `invoice_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_notes`("id", "invoice_id", "supplier_id", "document_id", "user_id", "content", "created_at") SELECT "id", "invoice_id", NULL, NULL, "user_id", "content", "created_at" FROM `notes`;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
ALTER TABLE `__new_notes` RENAME TO `notes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `invoices` ADD `account_reference` text;