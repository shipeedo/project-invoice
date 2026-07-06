ALTER TABLE `credit_requests` ADD `line_items` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_requests` ADD `requested_total` real;--> statement-breakpoint
ALTER TABLE `credit_requests` ADD `fuel_amount` real;--> statement-breakpoint
ALTER TABLE `credit_requests` ADD `gst_amount` real;--> statement-breakpoint
ALTER TABLE `credit_requests` ADD `approved_amount` real;--> statement-breakpoint
ALTER TABLE `credit_requests` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `original_due_date` integer;--> statement-breakpoint
ALTER TABLE `invoices` ADD `subtotal_amount` real;--> statement-breakpoint
ALTER TABLE `invoices` ADD `tax_amount` real;--> statement-breakpoint
ALTER TABLE `invoices` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `invoices` ADD `deleted_by_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `processed_o365_messages` ADD `ignore_reason` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `trading_term_days` integer;