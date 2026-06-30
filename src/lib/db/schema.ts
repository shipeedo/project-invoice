import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
      "RECEIVED",
      "PROCESSING",
      "PENDING_VALIDATION",
      "PENDING_APPROVAL",
      "APPROVED",
      "READY_FOR_PAYMENT",
      "REJECTED",
      "NEEDS_REVIEW",
    ],
  })
    .notNull()
    .default("RECEIVED"),
  sourceType: text("source_type", { enum: ["UPLOAD", "EMAIL"] })
    .notNull()
    .default("UPLOAD"),
  originalFileName: text("original_file_name"),
  filePath: text("file_path"),
  fileMimeType: text("file_mime_type"),
  vendorName: text("vendor_name"),
  vendorEmail: text("vendor_email"),
  invoiceNumber: text("invoice_number"),
  invoiceDate: integer("invoice_date", { mode: "timestamp_ms" }),
  dueDate: integer("due_date", { mode: "timestamp_ms" }),
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
  createdAt: timestamp(),
  updatedAt: updatedAt(),
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

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  invoices: many(invoices),
  suppliers: many(suppliers),
  routingRules: many(routingRules),
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
}));

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
