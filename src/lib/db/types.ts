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
