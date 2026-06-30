import { and, eq, isNull } from "drizzle-orm";
import { db, emailContacts, suppliers } from "@/lib/db";
import {
  buildNewSupplierValues,
  findMatchingSupplier,
} from "@/lib/supplier-extraction";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function extractDomain(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? null;
}

export async function upsertEmailContact(params: {
  organizationId: string;
  email: string;
  displayName?: string | null;
}) {
  const email = normalizeEmail(params.email);
  if (!email || !email.includes("@")) return null;

  const domain = extractDomain(email);
  const supplier = await findMatchingSupplier(params.organizationId, null, email);

  const existing = await db.query.emailContacts.findFirst({
    where: and(
      eq(emailContacts.organizationId, params.organizationId),
      eq(emailContacts.email, email),
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(emailContacts)
      .set({
        displayName: params.displayName?.trim() || existing.displayName,
        domain,
        supplierId: existing.supplierId ?? supplier?.id ?? null,
        messageCount: existing.messageCount + 1,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailContacts.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(emailContacts)
    .values({
      organizationId: params.organizationId,
      email,
      displayName: params.displayName?.trim() || null,
      domain,
      supplierId: supplier?.id ?? null,
      messageCount: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    })
    .returning();

  return created;
}

export async function resolveSupplierIdForEmail(
  organizationId: string,
  email?: string | null,
  displayName?: string | null,
) {
  if (!email) return null;

  await upsertEmailContact({ organizationId, email, displayName });
  const supplier = await findMatchingSupplier(organizationId, displayName, email);
  return supplier?.id ?? null;
}

export async function getSupplierSuggestions(organizationId: string) {
  const contacts = await db.query.emailContacts.findMany({
    where: and(
      eq(emailContacts.organizationId, organizationId),
      isNull(emailContacts.supplierId),
    ),
    orderBy: (table, { desc }) => [desc(table.messageCount), desc(table.lastSeenAt)],
  });

  return contacts.map((contact) => ({
    id: contact.id,
    email: contact.email,
    displayName: contact.displayName,
    domain: contact.domain,
    messageCount: contact.messageCount,
    lastSeenAt: contact.lastSeenAt,
    suggestedName: contact.displayName ?? contact.domain ?? contact.email,
  }));
}

export async function createSupplierFromEmailContact(params: {
  organizationId: string;
  contactId?: string;
  email?: string;
  name?: string;
}) {
  let contactEmail = params.email ? normalizeEmail(params.email) : null;
  let displayName = params.name?.trim() || null;

  if (params.contactId) {
    const contact = await db.query.emailContacts.findFirst({
      where: and(
        eq(emailContacts.id, params.contactId),
        eq(emailContacts.organizationId, params.organizationId),
      ),
    });
    if (!contact) {
      return { error: "Contact not found" as const };
    }
    contactEmail = contact.email;
    displayName = displayName ?? contact.displayName;
  }

  if (!contactEmail) {
    return { error: "Email is required" as const };
  }

  const existingSupplier = await findMatchingSupplier(
    params.organizationId,
    displayName,
    contactEmail,
  );
  if (existingSupplier) {
    await linkEmailContactToSupplier({
      organizationId: params.organizationId,
      email: contactEmail,
      supplierId: existingSupplier.id,
    });
    return { supplier: existingSupplier, existing: true as const };
  }

  const domain = extractDomain(contactEmail);
  const supplierName = displayName ?? domain ?? contactEmail;

  const [supplier] = await db
    .insert(suppliers)
    .values(
      buildNewSupplierValues({
        organizationId: params.organizationId,
        name: supplierName,
        emailAddresses: [contactEmail],
        emailDomains: domain ? [domain] : [],
      }),
    )
    .returning();

  await linkEmailContactToSupplier({
    organizationId: params.organizationId,
    email: contactEmail,
    supplierId: supplier.id,
  });

  return { supplier, existing: false as const };
}

export async function linkEmailContactToSupplier(params: {
  organizationId: string;
  email: string;
  supplierId: string;
}) {
  const email = normalizeEmail(params.email);
  await db
    .update(emailContacts)
    .set({
      supplierId: params.supplierId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailContacts.organizationId, params.organizationId),
        eq(emailContacts.email, email),
      ),
    );
}

export async function linkSupplierToThreadsAndMessages(params: {
  organizationId: string;
  supplierId: string;
  email: string;
}) {
  const normalized = normalizeEmail(params.email);
  const { emailThreads, mailboxMessages } = await import("@/lib/db");

  await db
    .update(mailboxMessages)
    .set({ supplierId: params.supplierId })
    .where(
      and(
        eq(mailboxMessages.organizationId, params.organizationId),
        eq(mailboxMessages.fromEmail, normalized),
      ),
    );

  const threads = await db.query.mailboxMessages.findMany({
    where: and(
      eq(mailboxMessages.organizationId, params.organizationId),
      eq(mailboxMessages.fromEmail, normalized),
    ),
    columns: { threadId: true },
  });

  const threadIds = [...new Set(threads.map((message) => message.threadId))];
  for (const threadId of threadIds) {
    await db
      .update(emailThreads)
      .set({ supplierId: params.supplierId, updatedAt: new Date() })
      .where(
        and(
          eq(emailThreads.id, threadId),
          eq(emailThreads.organizationId, params.organizationId),
        ),
      );
  }
}
