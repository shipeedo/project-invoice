import { relations } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
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
  // Product access is deny-by-default: the auth server may issue a token,
  // but only users designated by an admin can use the app.
  hasAccess: integer("has_access", { mode: "boolean" }).notNull().default(false),
  // Heartbeat: stamped each time this user's client polls for notifications.
  lastNotificationCheckAt: integer("last_notification_check_at", {
    mode: "timestamp_ms",
  }),
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
  // The due date as stated on the invoice document, retained only when the
  // supplier's trading terms overrode it (invoice date + term days). Null means
  // the due date was not overridden.
  originalDueDate: integer("original_due_date", { mode: "timestamp_ms" }),
  respondByDate: integer("respond_by_date", { mode: "timestamp_ms" }),
  totalAmount: real("total_amount"),
  subtotalAmount: real("subtotal_amount"),
  taxAmount: real("tax_amount"),
  currency: text("currency").default("AUD"),
  // The customer/account identifier printed on the invoice. Suppliers label it
  // differently (Account, Cost centre, Reference, Department); extraction
  // normalizes whichever appears into this one field for routing.
  accountReference: text("account_reference"),
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
  // When the current assignee received the invoice — the clock escalation
  // rules measure idle time against. Reset on every (re)assignment.
  assignedAt: integer("assigned_at", { mode: "timestamp_ms" }),
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
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  deletedById: text("deleted_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp(),
  updatedAt: updatedAt(),
});

// A note attaches to exactly one of invoiceId/supplierId (enforced in the API,
// not the schema). documentId additionally links a note to an uploaded document
// on the same invoice.
export const notes = sqliteTable("notes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  invoiceId: text("invoice_id").references(() => invoices.id, {
    onDelete: "cascade",
  }),
  supplierId: text("supplier_id").references(() => suppliers.id, {
    onDelete: "cascade",
  }),
  documentId: text("document_id").references(() => invoiceDocuments.id, {
    onDelete: "set null",
  }),
  userId: text("user_id"),
  content: text("content").notNull(),
  createdAt: timestamp(),
});

// A rebill passes an invoice's charges on to a customer; the accounts team
// raises the sales invoice in the accounting system from the attached documents.
export const rebills = sqliteTable("rebills", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  // Optional customer/account reference quoted on the sales invoice.
  reference: text("reference"),
  createdById: text("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp(),
});

// User-uploaded documents on an invoice (distinct from invoiceAttachments,
// which are the source files that arrived with the invoice itself).
export const invoiceDocuments = sqliteTable("invoice_documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  // Set when the document was uploaded as part of a rebill.
  rebillId: text("rebill_id").references(() => rebills.id, {
    onDelete: "set null",
  }),
  // Set when the document arrived via the credit request workflow.
  creditRequestId: text("credit_request_id").references(() => creditRequests.id, {
    onDelete: "set null",
  }),
  uploadedById: text("uploaded_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  kind: text("kind", { enum: ["GENERAL", "REBILL", "CREDIT"] })
    .notNull()
    .default("GENERAL"),
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
  // COMBO rules AND together several conditions; their condition JSON holds a
  // `conditions` array. The other types are legacy single-condition shapes.
  type: text("type", {
    enum: [
      "SUPPLIER",
      "SENDER_EMAIL",
      "AMOUNT_THRESHOLD",
      "PARSE_FAILURE",
      "COMBO",
      "DEFAULT",
    ],
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

export const escalationRules = sqliteTable("escalation_rules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Null means the rule watches every assignee (catch-all).
  watchedUserId: text("watched_user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  afterBusinessDays: integer("after_business_days").notNull(),
  escalateToId: text("escalate_to_id").references(() => users.id, {
    onDelete: "set null",
  }),
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
  // Optional trading terms: number of days after the invoice date until an
  // invoice is due. When set, it overrides the due date stated on invoices.
  tradingTermDays: integer("trading_term_days"),
  extractionPrompt: text("extraction_prompt"),
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

export const aiConnectors = sqliteTable("ai_connectors", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  connectorType: text("connector_type", {
    enum: ["AI_GATEWAY", "OPENAI_COMPATIBLE"],
  })
    .notNull()
    .default("OPENAI_COMPATIBLE"),
  // Encrypted with the shared AUTH_SECRET-derived key. Never returned by the API.
  apiKeyEncrypted: text("api_key_encrypted"),
  // Required for OPENAI_COMPATIBLE (e.g. http://127.0.0.1:8000/v1). Null for the
  // AI Gateway, which uses its fixed hosted URL.
  baseUrl: text("base_url"),
  // Gateway model id (e.g. openai/gpt-4o-mini) or a manual model name.
  model: text("model"),
  // Per-token USD pricing snapshotted from the gateway /v1/models list when the
  // model is selected, so per-call cost is computed without a network round-trip.
  modelInputPrice: real("model_input_price"),
  modelOutputPrice: real("model_output_price"),
  // Cached gateway credit balance for the sidebar low-balance warning, refreshed
  // opportunistically so it is never fetched during a page render.
  creditsBalance: real("credits_balance"),
  creditsCheckedAt: integer("credits_checked_at", { mode: "timestamp_ms" }),
  configuredById: text("configured_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
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
    ignoreReason: text("ignore_reason"),
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

export const processingJobs = sqliteTable(
  "processing_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    mailboxMessageId: text("mailbox_message_id")
      .notNull()
      .references(() => mailboxMessages.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
    })
      .notNull()
      .default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    /** How the job finished: invoice_created or an ignore reason. */
    outcome: text("outcome"),
    lastError: text("last_error"),
    invoiceId: text("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    // AI usage/cost snapshot captured when the extraction ran. costUsd is only
    // populated for AI Gateway connectors, where per-token pricing is known.
    aiModel: text("ai_model"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    costUsd: real("cost_usd"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: timestamp(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("processing_jobs_message_unique").on(table.mailboxMessageId),
  ],
);

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
  lineItems: text("line_items").notNull().default("[]"),
  requestedTotal: real("requested_total"),
  gstAmount: real("gst_amount"),
  approvedAmount: real("approved_amount"),
  notes: text("notes"),
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

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // User whose action caused the notification; null for system/automated.
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    invoiceId: text("invoice_id").references(() => invoices.id, {
      onDelete: "cascade",
    }),
    type: text("type", {
      enum: ["INVOICE_ASSIGNED", "INVOICE_REMINDER", "NOTE_MENTION", "TEST"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Deep link opened when the notification is clicked; falls back to the
    // invoice page (or home) when null.
    url: text("url"),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: timestamp(),
  },
  (table) => [
    index("notifications_recipient_read_idx").on(table.recipientId, table.readAt),
  ],
);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
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
  pushSubscriptions: many(pushSubscriptions),
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
  deletedBy: one(users, {
    fields: [invoices.deletedById],
    references: [users.id],
  }),
  notes: many(notes),
  auditEvents: many(auditEvents),
  creditDrafts: many(creditDrafts),
  creditRequests: many(creditRequests),
  attachments: many(invoiceAttachments),
  documents: many(invoiceDocuments),
  rebills: many(rebills),
  mailboxMessages: many(mailboxMessages),
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

export const aiConnectorsRelations = relations(aiConnectors, ({ one }) => ({
  organization: one(organizations, {
    fields: [aiConnectors.organizationId],
    references: [organizations.id],
  }),
  configuredBy: one(users, {
    fields: [aiConnectors.configuredById],
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
  supplier: one(suppliers, {
    fields: [notes.supplierId],
    references: [suppliers.id],
  }),
  document: one(invoiceDocuments, {
    fields: [notes.documentId],
    references: [invoiceDocuments.id],
  }),
  // notes.userId predates FK discipline (plain text column); the relation still
  // resolves author names for display.
  user: one(users, {
    fields: [notes.userId],
    references: [users.id],
  }),
}));

export const rebillsRelations = relations(rebills, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [rebills.organizationId],
    references: [organizations.id],
  }),
  invoice: one(invoices, {
    fields: [rebills.invoiceId],
    references: [invoices.id],
  }),
  createdBy: one(users, {
    fields: [rebills.createdById],
    references: [users.id],
  }),
  documents: many(invoiceDocuments),
}));

export const invoiceDocumentsRelations = relations(
  invoiceDocuments,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [invoiceDocuments.organizationId],
      references: [organizations.id],
    }),
    invoice: one(invoices, {
      fields: [invoiceDocuments.invoiceId],
      references: [invoices.id],
    }),
    rebill: one(rebills, {
      fields: [invoiceDocuments.rebillId],
      references: [rebills.id],
    }),
    creditRequest: one(creditRequests, {
      fields: [invoiceDocuments.creditRequestId],
      references: [creditRequests.id],
    }),
    uploadedBy: one(users, {
      fields: [invoiceDocuments.uploadedById],
      references: [users.id],
    }),
    notes: many(notes),
  }),
);

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

export const escalationRulesRelations = relations(escalationRules, ({ one }) => ({
  organization: one(organizations, {
    fields: [escalationRules.organizationId],
    references: [organizations.id],
  }),
  watchedUser: one(users, {
    fields: [escalationRules.watchedUserId],
    references: [users.id],
  }),
  escalateTo: one(users, {
    fields: [escalationRules.escalateToId],
    references: [users.id],
  }),
}));

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [suppliers.organizationId],
    references: [organizations.id],
  }),
  invoices: many(invoices),
  notes: many(notes),
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

export const processingJobsRelations = relations(processingJobs, ({ one }) => ({
  organization: one(organizations, {
    fields: [processingJobs.organizationId],
    references: [organizations.id],
  }),
  message: one(mailboxMessages, {
    fields: [processingJobs.mailboxMessageId],
    references: [mailboxMessages.id],
  }),
  invoice: one(invoices, {
    fields: [processingJobs.invoiceId],
    references: [invoices.id],
  }),
}));

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

export const notificationsRelations = relations(notifications, ({ one }) => ({
  organization: one(organizations, {
    fields: [notifications.organizationId],
    references: [organizations.id],
  }),
  recipient: one(users, {
    fields: [notifications.recipientId],
    references: [users.id],
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
  }),
  invoice: one(invoices, {
    fields: [notifications.invoiceId],
    references: [invoices.id],
  }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type RoutingRule = typeof routingRules.$inferSelect;
export type EscalationRule = typeof escalationRules.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type CreditDraft = typeof creditDrafts.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Rebill = typeof rebills.$inferSelect;
export type InvoiceDocument = typeof invoiceDocuments.$inferSelect;
export type O365Connection = typeof o365Connections.$inferSelect;
export type InvoiceAttachment = typeof invoiceAttachments.$inferSelect;
export type ProcessedO365Message = typeof processedO365Messages.$inferSelect;
export type EmailThread = typeof emailThreads.$inferSelect;
export type MailboxMessage = typeof mailboxMessages.$inferSelect;
export type MailboxMessageAttachment = typeof mailboxMessageAttachments.$inferSelect;
export type EmailContact = typeof emailContacts.$inferSelect;
export type CreditRequest = typeof creditRequests.$inferSelect;
export type ProcessingJob = typeof processingJobs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
