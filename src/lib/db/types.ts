export const userRoles = ["ADMIN", "APPROVER", "USER"] as const;
export type UserRole = (typeof userRoles)[number];

export const invoiceStatuses = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "ON_HOLD",
  "CANCELLED",
] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const invoiceSourceTypes = ["UPLOAD", "EMAIL"] as const;
export type InvoiceSourceType = (typeof invoiceSourceTypes)[number];

export const routingRuleTypes = [
  "SUPPLIER",
  "SENDER_EMAIL",
  "AMOUNT_THRESHOLD",
  "PARSE_FAILURE",
  "COMBO",
  "DEFAULT",
] as const;
export type RoutingRuleType = (typeof routingRuleTypes)[number];

export const invoiceDocumentKinds = ["GENERAL", "REBILL", "CREDIT"] as const;
export type InvoiceDocumentKind = (typeof invoiceDocumentKinds)[number];

export const o365ConnectionStatuses = ["CONNECTED", "DISCONNECTED", "ERROR"] as const;
export type O365ConnectionStatus = (typeof o365ConnectionStatuses)[number];

export const aiConnectorTypes = [
  "AI_GATEWAY",
  "OPENROUTER",
  "OPENAI_COMPATIBLE",
] as const;
export type AiConnectorType = (typeof aiConnectorTypes)[number];

/**
 * Lifecycle of a credit request with the carrier. This is deliberately not the
 * invoice status — the two used to look alike ("Draft"/"Approved"), which read
 * as the invoice's own state in the credits table.
 */
export const creditRequestStatuses = [
  "PENDING",
  "SUBMITTED",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
] as const;
export type CreditRequestStatus = (typeof creditRequestStatuses)[number];

export const mailboxMessageDirections = ["INBOUND", "OUTBOUND"] as const;
export type MailboxMessageDirection = (typeof mailboxMessageDirections)[number];

export const processingJobStatuses = [
  "PENDING",
  "PROCESSING",
  "RATE_LIMITED",
  "COMPLETED",
  "FAILED",
] as const;
export type ProcessingJobStatus = (typeof processingJobStatuses)[number];

export const notificationTypes = [
  "INVOICE_ASSIGNED",
  "INVOICE_REMINDER",
  "NOTE_MENTION",
  "NOTE_MESSAGE",
  "NOTE_PARTICIPANT_ADDED",
  "TEST",
] as const;
export type NotificationType = (typeof notificationTypes)[number];
