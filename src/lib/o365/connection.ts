import { eq } from "drizzle-orm";
import { db, o365Connections } from "@/lib/db";
import type { O365ConnectionStatus } from "@/lib/db/types";
import { decryptSecret, encryptSecret } from "@/lib/o365/crypto";
import {
  decodeMicrosoftIdTokenTenant,
  refreshMicrosoftTokens,
  type MicrosoftTokenResponse,
} from "@/lib/o365/oauth";

export async function getO365Connection(organizationId: string) {
  return db.query.o365Connections.findFirst({
    where: eq(o365Connections.organizationId, organizationId),
  });
}

export async function upsertO365Connection(params: {
  organizationId: string;
  userId: string;
  tokens: MicrosoftTokenResponse;
  microsoftTenantId?: string | null;
}) {
  const expiresAt = new Date(Date.now() + params.tokens.expires_in * 1000);
  const tenantId =
    params.microsoftTenantId ??
    decodeMicrosoftIdTokenTenant(params.tokens.id_token);

  const values = {
    organizationId: params.organizationId,
    microsoftTenantId: tenantId,
    accessTokenEncrypted: encryptSecret(params.tokens.access_token),
    refreshTokenEncrypted: params.tokens.refresh_token
      ? encryptSecret(params.tokens.refresh_token)
      : null,
    tokenExpiresAt: expiresAt,
    status: "CONNECTED" as O365ConnectionStatus,
    lastError: null,
    connectedById: params.userId,
    connectedAt: new Date(),
    updatedAt: new Date(),
  };

  const existing = await getO365Connection(params.organizationId);
  if (existing) {
    const [updated] = await db
      .update(o365Connections)
      .set(values)
      .where(eq(o365Connections.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(o365Connections).values(values).returning();
  return created;
}

export async function updateO365Mailbox(params: {
  organizationId: string;
  mailboxId: string;
  mailboxUpn: string;
}) {
  const [updated] = await db
    .update(o365Connections)
    .set({
      selectedMailboxId: params.mailboxId,
      selectedMailboxUpn: params.mailboxUpn,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(o365Connections.organizationId, params.organizationId))
    .returning();

  return updated ?? null;
}

export async function disconnectO365(organizationId: string) {
  const [updated] = await db
    .update(o365Connections)
    .set({
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      selectedMailboxId: null,
      selectedMailboxUpn: null,
      status: "DISCONNECTED",
      lastError: null,
      lastSyncedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(o365Connections.organizationId, organizationId))
    .returning();

  return updated ?? null;
}

export async function markO365ConnectionError(
  organizationId: string,
  message: string,
) {
  await db
    .update(o365Connections)
    .set({
      status: "ERROR",
      lastError: message,
      updatedAt: new Date(),
    })
    .where(eq(o365Connections.organizationId, organizationId));
}

export async function getValidAccessToken(connection: {
  id: string;
  organizationId: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  microsoftTenantId: string | null;
}) {
  if (!connection.accessTokenEncrypted) {
    throw new Error("O365 connection has no access token");
  }

  const expiresSoon =
    !connection.tokenExpiresAt ||
    connection.tokenExpiresAt.getTime() <= Date.now() + 60_000;

  if (!expiresSoon) {
    return decryptSecret(connection.accessTokenEncrypted);
  }

  if (!connection.refreshTokenEncrypted) {
    throw new Error("O365 access token expired and no refresh token is available");
  }

  const refreshToken = decryptSecret(connection.refreshTokenEncrypted);
  const tokens = await refreshMicrosoftTokens(
    refreshToken,
    connection.microsoftTenantId,
  );

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await db
    .update(o365Connections)
    .set({
      accessTokenEncrypted: encryptSecret(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token)
        : connection.refreshTokenEncrypted,
      tokenExpiresAt: expiresAt,
      status: "CONNECTED",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(o365Connections.id, connection.id));

  return tokens.access_token;
}