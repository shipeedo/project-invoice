export const userRoles = ["ADMIN", "APPROVER", "USER"] as const;
export type UserRole = (typeof userRoles)[number];

export const invoiceStatuses = [
  "RECEIVED",
  "PROCESSING",
  "PENDING_VALIDATION",
  "PENDING_APPROVAL",
  "APPROVED",
  "READY_FOR_PAYMENT",
  "REJECTED",
  "NEEDS_REVIEW",
] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const invoiceSourceTypes = ["UPLOAD", "EMAIL"] as const;
export type InvoiceSourceType = (typeof invoiceSourceTypes)[number];

export const routingRuleTypes = [
  "SENDER_EMAIL",
  "AMOUNT_THRESHOLD",
  "PARSE_FAILURE",
  "DEFAULT",
] as const;
export type RoutingRuleType = (typeof routingRuleTypes)[number];

export const o365ConnectionStatuses = ["CONNECTED", "DISCONNECTED", "ERROR"] as const;
export type O365ConnectionStatus = (typeof o365ConnectionStatuses)[number];

export const creditRequestStatuses = [
  "DRAFT",
  "SENT",
  "AWAITING_USER",
  "CONTESTED",
  "APPROVED",
  "REJECTED",
] as const;
export type CreditRequestStatus = (typeof creditRequestStatuses)[number];

export const carrierDecisions = ["APPROVED", "DENIED"] as const;
export type CarrierDecision = (typeof carrierDecisions)[number];

export const mailboxMessageDirections = ["INBOUND", "OUTBOUND"] as const;
export type MailboxMessageDirection = (typeof mailboxMessageDirections)[number];
