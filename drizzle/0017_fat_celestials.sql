ALTER TABLE `credit_requests` DROP COLUMN `carrier_decision`;--> statement-breakpoint
-- Credit statuses became a carrier-facing lifecycle of their own. An approval
-- short of the requested total is now its own status, so backfill that before
-- the plain renames.
UPDATE `credit_requests`
SET `status` = 'PARTIALLY_APPROVED'
WHERE `status` = 'APPROVED'
  AND `approved_amount` IS NOT NULL
  AND `requested_total` IS NOT NULL
  AND ROUND(`approved_amount` * 100) < ROUND(`requested_total` * 100);--> statement-breakpoint
UPDATE `credit_requests` SET `status` = 'PENDING' WHERE `status` = 'DRAFT';--> statement-breakpoint
-- SENT, AWAITING_USER and CONTESTED all meant "with the carrier, undecided".
-- These rows were created by the send itself, so created_at is when they went
-- out; without it they would read as submitted-but-never-sent, and only a
-- PENDING request can be marked submitted by hand.
UPDATE `credit_requests`
SET `status` = 'SUBMITTED', `submitted_at` = COALESCE(`submitted_at`, `created_at`)
WHERE `status` IN ('SENT', 'AWAITING_USER', 'CONTESTED');
