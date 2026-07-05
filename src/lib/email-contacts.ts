import { and, eq, isNull } from "drizzle-orm";
import { db, emailContacts, emailThreads, mailboxMessages, suppliers } from "@/lib/db";
import {
  extractReferencedCompanyFromEmail,
  getEmbeddedSenderFromForwardedBody,
  isForwardedEmailBody,
  resolvePlainEmailBody,
  splitEmailThread,
} from "@/lib/email-body";
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

export async function resolveSupplierIdFromInboundMessage(params: {
  organizationId: string;
  fromEmail?: string | null;
  fromName?: string | null;
  subject?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
}) {
  if (!params.fromEmail) return null;

  await upsertEmailContact({
    organizationId: params.organizationId,
    email: params.fromEmail,
    displayName: params.fromName,
  });

  const body = resolvePlainEmailBody({
    bodyHtml: params.bodyHtml,
    bodyText: params.bodyText,
  });

  if (isForwardedEmailBody(body)) {
    const referencedCompany = extractReferencedCompanyFromEmail({
      subject: params.subject,
      body,
    });

    if (referencedCompany) {
      const supplier = await findMatchingSupplier(
        params.organizationId,
        referencedCompany,
        null,
      );
      if (supplier) return supplier.id;
    }

    const normalizedFrom = normalizeEmail(params.fromEmail);
    const outerDomain = extractDomain(normalizedFrom);
    const embeddedSenders = splitEmailThread(body)
      .filter(
        (part): part is typeof part & { fromEmail: string } =>
          part.source !== "wrapper" && Boolean(part.fromEmail),
      )
      .map((part) => ({
        fromEmail: part.fromEmail,
        fromName: part.fromName,
        domain: extractDomain(part.fromEmail),
      }))
      .filter(
        (sender) =>
          sender.fromEmail !== normalizedFrom && sender.domain !== outerDomain,
      );

    for (const sender of embeddedSenders.reverse()) {
      await upsertEmailContact({
        organizationId: params.organizationId,
        email: sender.fromEmail,
        displayName: sender.fromName,
      });
      const supplier = await findMatchingSupplier(
        params.organizationId,
        sender.fromName,
        sender.fromEmail,
      );
      if (supplier) return supplier.id;
    }

    const embedded = getEmbeddedSenderFromForwardedBody(body);
    if (embedded.fromEmail && embedded.fromEmail !== normalizedFrom) {
      await upsertEmailContact({
        organizationId: params.organizationId,
        email: embedded.fromEmail,
        displayName: embedded.fromName,
      });
      const supplier = await findMatchingSupplier(
        params.organizationId,
        embedded.fromName,
        embedded.fromEmail,
      );
      if (supplier) return supplier.id;
    }

    return null;
  }

  const supplier = await findMatchingSupplier(
    params.organizationId,
    params.fromName,
    params.fromEmail,
  );
  return supplier?.id ?? null;
}

export async function applySupplierLinkToMessage(params: {
  organizationId: string;
  messageId: string;
  threadId: string;
  fromEmail?: string | null;
  fromName?: string | null;
  subject?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  currentSupplierId?: string | null;
}) {
  const supplierId = await resolveSupplierIdFromInboundMessage({
    organizationId: params.organizationId,
    fromEmail: params.fromEmail,
    fromName: params.fromName,
    subject: params.subject,
    bodyHtml: params.bodyHtml,
    bodyText: params.bodyText,
  });

  if (!supplierId || supplierId === params.currentSupplierId) {
    return supplierId;
  }

  await db
    .update(mailboxMessages)
    .set({ supplierId })
    .where(
      and(
        eq(mailboxMessages.id, params.messageId),
        eq(mailboxMessages.organizationId, params.organizationId),
      ),
    );

  await db
    .update(emailThreads)
    .set({ supplierId, updatedAt: new Date() })
    .where(
      and(
        eq(emailThreads.id, params.threadId),
        eq(emailThreads.organizationId, params.organizationId),
        isNull(emailThreads.supplierId),
      ),
    );

  return supplierId;
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
  contactName?: string;
  emailDomains?: string[];
}) {
  let contactEmail = params.email ? normalizeEmail(params.email) : null;
  let displayName = params.contactName?.trim() || params.name?.trim() || null;

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
  const emailDomains =
    params.emailDomains?.map((entry) => entry.trim().toLowerCase()).filter(Boolean) ??
    (domain ? [domain] : []);
  const supplierName =
    params.name?.trim() || displayName || domain || contactEmail;

  const [supplier] = await db
    .insert(suppliers)
    .values(
      buildNewSupplierValues({
        organizationId: params.organizationId,
        name: supplierName,
        emailAddresses: [contactEmail],
        emailDomains,
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
