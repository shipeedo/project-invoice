import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

const timestamp = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());

export const organizations = sqliteTable("organizations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp(),
  updatedAt: updatedAt(),
});

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role", { enum: ["ADMIN", "APPROVER", "USER"] })
    .notNull()
    .default("APPROVER"),
  createdAt: timestamp(),
  updatedAt: updatedAt(),
});

export const invoices = sqliteTable("invoices", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: [
      "DRAFT",
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "ON_HOLD",
      "PART_PAID",
      "PAID",
      "CANCELLED",
    ],
  })
    .notNull()
    .default("DRAFT"),
  sourceType: text("source_type", { enum: ["UPLOAD", "EMAIL"] })
    .notNull()
    .default("UPLOAD"),
  sourceMessageId: text("source_message_id"),
  emailSubject: text("email_subject"),
  emailFrom: text("email_from"),
  emailFromName: text("email_from_name"),
  emailReceivedAt: integer("email_received_at", { mode: "timestamp_ms" }),
  emailBodyHtml: text("email_body_html"),
  emailBodyText: text("email_body_text"),
  originalFileName: text("original_file_name"),
  filePath: text("file_path"),
  fileMimeType: text("file_mime_type"),
  vendorName: text("vendor_name"),
  vendorEmail: text("vendor_email"),
  invoiceNumber: text("invoice_number"),
  invoiceDate: integer("invoice_date", { mode: "timestamp_ms" }),
  dueDate: integer("due_date", { mode: "timestamp_ms" }),
  respondByDate: integer("respond_by_date", { mode: "timestamp_ms" }),
  totalAmount: real("total_amount"),
  currency: text("currency").default("AUD"),
  lineItems: text("line_items"),
  extractionCandidates: text("extraction_candidates"),
  extractionRaw: text("extraction_raw"),
  parseError: text("parse_error"),
  supplierId: text("supplier_id").references(() => suppliers.id, {
    onDelete: "set null",
  }),
  validatedAt: integer("validated_at", { mode: "timestamp_ms" }),
  validatedById: text("validated_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  assignedToId: text("assigned_to_id").references(() => users.id, {
    onDelete: "set null",
  }),
  amountPaid: real("amount_paid").notNull().default(0),
  paidAt: integer("paid_at", { mode: "timestamp_ms" }),
  markedPaidById: text("marked_paid_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  onHoldAt: integer("on_hold_at", { mode: "timestamp_ms" }),
  onHoldById: text("on_hold_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  onHoldReason: text("on_hold_reason"),
  // Status to restore when the hold is released.
  holdPreviousStatus: text("hold_previous_status"),
  cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  cancelledById: text("cancelled_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp(),
  updatedAt: updatedAt(),
});

export const invoicePayments = sqliteTable("invoice_payments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  paidAt: integer("paid_at", { mode: "timestamp_ms" }).notNull(),
  recordedById: text("recorded_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  // Link or reference to the transaction in the accounting software.
  transactionRef: text("transaction_ref"),
  note: text("note"),
  createdAt: timestamp(),
});

export const notes = sqliteTable("notes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  content: text("content").notNull(),
  createdAt: timestamp(),
});

export const routingRules = sqliteTable("routing_rules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priority: integer("priority").notNull(),
  type: text("type", {
    enum: ["SENDER_EMAIL", "AMOUNT_THRESHOLD", "PARSE_FAILURE", "DEFAULT"],
  }).notNull(),
  condition: text("condition").notNull(),
  approverId: text("approver_id").references(() => users.id, {
    onDelete: "set null",
  }),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: timestamp(),
  updatedAt: updatedAt(),
});

export const suppliers = sqliteTable("suppliers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emailAddresses: text("email_addresses").notNull().default("[]"),
  emailDomains: text("email_domains").notNull().default("[]"),
  extractionPrompt: text("extraction_prompt"),
  fieldMappings: text("field_mappings").notNull().default("{}"),
  createdAt: timestamp(),
  updatedAt: updatedAt(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  invoiceId: text("invoice_id").references(() => invoices.id, {
    onDelete: "cascade",
  }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: timestamp(),
});

export const o365Connections = sqliteTable("o365_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  microsoftTenantId: text("microsoft_tenant_id"),
  accessTokenEncrypted: text("access_token_encrypted"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  tokenExpiresAt: integer("token_expires_at", { mode: "timestamp_ms" }),
  selectedMailboxId: text("selected_mailbox_id"),
  selectedMailboxUpn: text("selected_mailbox_upn"),
  status: text("status", {
    enum: ["CONNECTED", "DISCONNECTED", "ERROR"],
  })
    .notNull()
    .default("DISCONNECTED"),
  lastError: text("last_error"),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
  connectedById: text("connected_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  connectedAt: integer("connected_at", { mode: "timestamp_ms" }),
  createdAt: timestamp(),
  updatedAt: updatedAt(),
});

export const invoiceAttachments = sqliteTable("invoice_attachments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  createdAt: timestamp(),
});

export const processedO365Messages = sqliteTable(
  "processed_o365_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    invoiceId: text("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    processedAt: timestamp(),
  },
  (table) => [
    uniqueIndex("processed_o365_messages_org_message_unique").on(
      table.organizationId,
      table.messageId,
    ),
  ],
);

export const emailThreads = sqliteTable(
  "email_threads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    graphConversationId: text("graph_conversation_id"),
    subject: text("subject"),
    supplierId: text("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    createdAt: timestamp(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("email_threads_org_conversation_unique").on(
      table.organizationId,
      table.graphConversationId,
    ),
  ],
);

export const mailboxMessages = sqliteTable(
  "mailbox_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    graphMessageId: text("graph_message_id").notNull(),
    internetMessageId: text("internet_message_id"),
    direction: text("direction", { enum: ["INBOUND", "OUTBOUND"] }).notNull(),
    fromEmail: text("from_email"),
    fromName: text("from_name"),
    toEmails: text("to_emails").notNull().default("[]"),
    ccEmails: text("cc_emails").notNull().default("[]"),
    subject: text("subject"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }),
    sentByUserId: text("sent_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    supplierId: text("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    invoiceId: text("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    hasAttachments: integer("has_attachments", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: timestamp(),
  },
  (table) => [
    uniqueIndex("mailbox_messages_org_graph_message_unique").on(
      table.organizationId,
      table.graphMessageId,
    ),
  ],
);

export const mailboxMessageAttachments = sqliteTable("mailbox_message_attachments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  messageId: text("message_id")
    .notNull()
    .references(() => mailboxMessages.id, { onDelete: "cascade" }),
  graphAttachmentId: text("graph_attachment_id"),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  isInline: integer("is_inline", { mode: "boolean" }).notNull().default(false),
  contentId: text("content_id"),
  createdAt: timestamp(),
});

export const emailContacts = sqliteTable(
  "email_contacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name"),
    domain: text("domain"),
    supplierId: text("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    messageCount: integer("message_count").notNull().default(1),
    firstSeenAt: timestamp(),
    lastSeenAt: timestamp(),
    createdAt: timestamp(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("email_contacts_org_email_unique").on(
      table.organizationId,
      table.email,
    ),
  ],
);

export const creditRequests = sqliteTable("credit_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  threadId: text("thread_id").references(() => emailThreads.id, {
    onDelete: "set null",
  }),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["DRAFT", "SENT", "AWAITING_USER", "CONTESTED", "APPROVED", "REJECTED"],
  })
    .notNull()
    .default("DRAFT"),
  carrierDecision: text("carrier_decision", {
    enum: ["APPROVED", "DENIED"],
  }),
  subject: text("subject").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  message: text("message").notNull(),
  attachments: text("attachments").notNull().default("[]"),
  rootMessageId: text("root_message_id").references(() => mailboxMessages.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp(),
  updatedAt: updatedAt(),
});

export const creditDrafts = sqliteTable("credit_drafts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  attachments: text("attachments").notNull().default("[]"),
  createdAt: timestamp(),
});

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  users: many(users),
  invoices: many(invoices),
  suppliers: many(suppliers),
  routingRules: many(routingRules),
  o365Connection: one(o365Connections),
  processedO365Messages: many(processedO365Messages),
  emailThreads: many(emailThreads),
  mailboxMessages: many(mailboxMessages),
  emailContacts: many(emailContacts),
  creditRequests: many(creditRequests),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  assignedInvoices: many(invoices),
  routingRules: many(routingRules),
  auditEvents: many(auditEvents),
  creditDrafts: many(creditDrafts),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [invoices.organizationId],
    references: [organizations.id],
  }),
  supplier: one(suppliers, {
    fields: [invoices.supplierId],
    references: [suppliers.id],
  }),
  assignedTo: one(users, {
    fields: [invoices.assignedToId],
    references: [users.id],
  }),
  validatedBy: one(users, {
    fields: [invoices.validatedById],
    references: [users.id],
  }),
  notes: many(notes),
  auditEvents: many(auditEvents),
  creditDrafts: many(creditDrafts),
  creditRequests: many(creditRequests),
  attachments: many(invoiceAttachments),
  mailboxMessages: many(mailboxMessages),
  payments: many(invoicePayments),
}));

export const invoicePaymentsRelations = relations(invoicePayments, ({ one }) => ({
  organization: one(organizations, {
    fields: [invoicePayments.organizationId],
    references: [organizations.id],
  }),
  invoice: one(invoices, {
    fields: [invoicePayments.invoiceId],
    references: [invoices.id],
  }),
  recordedBy: one(users, {
    fields: [invoicePayments.recordedById],
    references: [users.id],
  }),
}));

export const o365ConnectionsRelations = relations(o365Connections, ({ one }) => ({
  organization: one(organizations, {
    fields: [o365Connections.organizationId],
    references: [organizations.id],
  }),
  connectedBy: one(users, {
    fields: [o365Connections.connectedById],
    references: [users.id],
  }),
}));

export const invoiceAttachmentsRelations = relations(
  invoiceAttachments,
  ({ one }) => ({
    invoice: one(invoices, {
      fields: [invoiceAttachments.invoiceId],
      references: [invoices.id],
    }),
  }),
);

export const processedO365MessagesRelations = relations(
  processedO365Messages,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [processedO365Messages.organizationId],
      references: [organizations.id],
    }),
    invoice: one(invoices, {
      fields: [processedO365Messages.invoiceId],
      references: [invoices.id],
    }),
  }),
);

export const notesRelations = relations(notes, ({ one }) => ({
  invoice: one(invoices, {
    fields: [notes.invoiceId],
    references: [invoices.id],
  }),
}));

export const routingRulesRelations = relations(routingRules, ({ one }) => ({
  organization: one(organizations, {
    fields: [routingRules.organizationId],
    references: [organizations.id],
  }),
  approver: one(users, {
    fields: [routingRules.approverId],
    references: [users.id],
  }),
}));

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [suppliers.organizationId],
    references: [organizations.id],
  }),
  invoices: many(invoices),
  emailThreads: many(emailThreads),
  mailboxMessages: many(mailboxMessages),
  emailContacts: many(emailContacts),
}));

export const emailThreadsRelations = relations(emailThreads, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [emailThreads.organizationId],
    references: [organizations.id],
  }),
  supplier: one(suppliers, {
    fields: [emailThreads.supplierId],
    references: [suppliers.id],
  }),
  messages: many(mailboxMessages),
  creditRequests: many(creditRequests),
}));

export const mailboxMessagesRelations = relations(
  mailboxMessages,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [mailboxMessages.organizationId],
      references: [organizations.id],
    }),
    thread: one(emailThreads, {
      fields: [mailboxMessages.threadId],
      references: [emailThreads.id],
    }),
    supplier: one(suppliers, {
      fields: [mailboxMessages.supplierId],
      references: [suppliers.id],
    }),
    invoice: one(invoices, {
      fields: [mailboxMessages.invoiceId],
      references: [invoices.id],
    }),
    sentBy: one(users, {
      fields: [mailboxMessages.sentByUserId],
      references: [users.id],
    }),
    attachments: many(mailboxMessageAttachments),
  }),
);

export const mailboxMessageAttachmentsRelations = relations(
  mailboxMessageAttachments,
  ({ one }) => ({
    message: one(mailboxMessages, {
      fields: [mailboxMessageAttachments.messageId],
      references: [mailboxMessages.id],
    }),
  }),
);

export const emailContactsRelations = relations(emailContacts, ({ one }) => ({
  organization: one(organizations, {
    fields: [emailContacts.organizationId],
    references: [organizations.id],
  }),
  supplier: one(suppliers, {
    fields: [emailContacts.supplierId],
    references: [suppliers.id],
  }),
}));

export const creditRequestsRelations = relations(creditRequests, ({ one }) => ({
  organization: one(organizations, {
    fields: [creditRequests.organizationId],
    references: [organizations.id],
  }),
  invoice: one(invoices, {
    fields: [creditRequests.invoiceId],
    references: [invoices.id],
  }),
  thread: one(emailThreads, {
    fields: [creditRequests.threadId],
    references: [emailThreads.id],
  }),
  createdBy: one(users, {
    fields: [creditRequests.createdById],
    references: [users.id],
  }),
  rootMessage: one(mailboxMessages, {
    fields: [creditRequests.rootMessageId],
    references: [mailboxMessages.id],
  }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  invoice: one(invoices, {
    fields: [auditEvents.invoiceId],
    references: [invoices.id],
  }),
  user: one(users, {
    fields: [auditEvents.userId],
    references: [users.id],
  }),
}));

export const creditDraftsRelations = relations(creditDrafts, ({ one }) => ({
  invoice: one(invoices, {
    fields: [creditDrafts.invoiceId],
    references: [invoices.id],
  }),
  createdBy: one(users, {
    fields: [creditDrafts.createdById],
    references: [users.id],
  }),
}));

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type RoutingRule = typeof routingRules.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type CreditDraft = typeof creditDrafts.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type O365Connection = typeof o365Connections.$inferSelect;
export type InvoiceAttachment = typeof invoiceAttachments.$inferSelect;
export type ProcessedO365Message = typeof processedO365Messages.$inferSelect;
export type EmailThread = typeof emailThreads.$inferSelect;
export type MailboxMessage = typeof mailboxMessages.$inferSelect;
export type MailboxMessageAttachment = typeof mailboxMessageAttachments.$inferSelect;
export type EmailContact = typeof emailContacts.$inferSelect;
export type CreditRequest = typeof creditRequests.$inferSelect;
export type InvoicePayment = typeof invoicePayments.$inferSelect;
