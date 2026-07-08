ALTER TABLE `credit_requests` DROP COLUMN `fuel_amount`;--> statement-breakpoint
ALTER TABLE `invoices` DROP COLUMN `line_items`;--> statement-breakpoint
ALTER TABLE `invoices` DROP COLUMN `extraction_candidates`;--> statement-breakpoint
ALTER TABLE `suppliers` DROP COLUMN `field_mappings`;