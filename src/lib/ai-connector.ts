import { eq } from "drizzle-orm";
import { aiConnectors, db } from "@/lib/db";
import type { AiConnectorType } from "@/lib/db/types";
import type { AiUsage } from "@/lib/ai-chat";
import {
  AI_GATEWAY_BASE_URL,
  OPENROUTER_BASE_URL,
  isHostedConnector,
} from "@/lib/ai-config";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/** Show the low-balance warning once gateway credits fall below this (USD). */
export const AI_CREDITS_LOW_THRESHOLD = 10;

export type AiConnectorRow = typeof aiConnectors.$inferSelect;

/** A model offered by a hosted connector's catalog, with per-token USD pricing. */
export type CatalogModel = {
  id: string;
  name: string;
  pricing: { input: number; output: number } | null;
};

/**
 * Safe, API-facing view of the connector config. The encrypted API key is never
 * included — callers only learn whether a key is set.
 */
export type AiConnectorSummary = {
  connectorType: AiConnectorType;
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
  pricing: { input: number; output: number } | null;
  creditsBalance: number | null;
  creditsCheckedAt: string | null;
};

export async function getAiConnector(
  organizationId: string,
): Promise<AiConnectorRow | undefined> {
  return db.query.aiConnectors.findFirst({
    where: eq(aiConnectors.organizationId, organizationId),
  });
}

export function toAiConnectorSummary(
  connector: AiConnectorRow | undefined,
): AiConnectorSummary | null {
  if (!connector) return null;
  return {
    connectorType: connector.connectorType,
    baseUrl: connector.baseUrl,
    model: connector.model,
    hasApiKey: Boolean(connector.apiKeyEncrypted),
    pricing:
      connector.modelInputPrice != null && connector.modelOutputPrice != null
        ? { input: connector.modelInputPrice, output: connector.modelOutputPrice }
        : null,
    creditsBalance: connector.creditsBalance,
    creditsCheckedAt: connector.creditsCheckedAt?.toISOString() ?? null,
  };
}

export type SaveAiConnectorInput = {
  organizationId: string;
  configuredById?: string | null;
  connectorType: AiConnectorType;
  baseUrl?: string | null;
  model?: string | null;
  /** When provided, the key is re-encrypted; omit/blank to keep the existing key. */
  apiKey?: string | null;
  /**
   * Per-token USD pricing: snapshotted from the provider's model list for hosted
   * connectors, entered manually by the admin for OPENAI_COMPATIBLE.
   */
  pricing?: { input: number; output: number } | null;
};

/** Providers quote prices per million tokens; the DB stores per-token USD. */
export function perMillionToPerToken(usdPerMillion: number): number {
  return usdPerMillion / 1_000_000;
}

/** Inverse of {@link perMillionToPerToken}, for displaying stored prices. */
export function perTokenToPerMillion(usdPerToken: number): number {
  return usdPerToken * 1_000_000;
}

export async function saveAiConnector(input: SaveAiConnectorInput) {
  const existing = await getAiConnector(input.organizationId);

  const apiKeyEncrypted =
    input.apiKey && input.apiKey.trim()
      ? encryptSecret(input.apiKey.trim())
      : (existing?.apiKeyEncrypted ?? null);

  const hosted = isHostedConnector(input.connectorType);
  const values = {
    organizationId: input.organizationId,
    connectorType: input.connectorType,
    apiKeyEncrypted,
    baseUrl: hosted ? null : (input.baseUrl?.trim() || null),
    model: input.model?.trim() || null,
    modelInputPrice: input.pricing?.input ?? null,
    modelOutputPrice: input.pricing?.output ?? null,
    configuredById: input.configuredById ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(aiConnectors)
      .set(values)
      .where(eq(aiConnectors.organizationId, input.organizationId));
  } else {
    await db.insert(aiConnectors).values(values);
  }
}

/** cost = prompt_tokens * input_price + completion_tokens * output_price (per token). */
export function computeAiCallCostUsd(
  pricing: { input: number; output: number } | null,
  usage: AiUsage | null,
): number | null {
  if (!pricing || !usage) return null;
  return usage.promptTokens * pricing.input + usage.completionTokens * pricing.output;
}

/**
 * Computes the USD cost of a completed call using the org connector's per-token
 * pricing (gateway snapshot or manually entered). Returns null when usage or
 * either price is unavailable.
 */
export async function getAiCallCostUsd(
  organizationId: string,
  usage: AiUsage | null,
): Promise<number | null> {
  if (!usage) return null;
  const connector = await getAiConnector(organizationId);
  if (
    !connector ||
    connector.modelInputPrice == null ||
    connector.modelOutputPrice == null
  ) {
    return null;
  }
  return computeAiCallCostUsd(
    { input: connector.modelInputPrice, output: connector.modelOutputPrice },
    usage,
  );
}

function parsePrice(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Lists the AI Gateway's language models with per-token pricing. No auth required. */
export async function listGatewayModels(): Promise<CatalogModel[]> {
  const response = await fetch(`${AI_GATEWAY_BASE_URL}/models`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`AI Gateway models request failed (${response.status})`);
  }
  const body = (await response.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      type?: string;
      pricing?: { input?: unknown; output?: unknown };
    }>;
  };
  return (body.data ?? [])
    .filter((model) => !model.type || model.type === "language")
    .map((model) => {
      const input = parsePrice(model.pricing?.input);
      const output = parsePrice(model.pricing?.output);
      return {
        id: model.id,
        name: model.name ?? model.id,
        pricing: input != null && output != null ? { input, output } : null,
      };
    });
}

/** OpenRouter prices its router models at -1: the real cost is whatever model
 * they route to, so it isn't known up front. Treat that as no price rather than
 * letting a negative rate through into cost figures. */
function parseOpenRouterPrice(value: unknown): number | null {
  const price = parsePrice(value);
  return price != null && price >= 0 ? price : null;
}

/**
 * Lists OpenRouter's models with per-token pricing. No auth required. OpenRouter
 * quotes prices as per-token USD strings, and names models "Provider: Model" —
 * the provider is already shown by the picker's rail, so that prefix is dropped.
 */
export async function listOpenRouterModels(): Promise<CatalogModel[]> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`OpenRouter models request failed (${response.status})`);
  }
  const body = (await response.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      architecture?: { output_modalities?: string[] };
      pricing?: { prompt?: unknown; completion?: unknown };
    }>;
  };
  return (body.data ?? [])
    .filter((model) => {
      const outputs = model.architecture?.output_modalities;
      return !outputs || outputs.includes("text");
    })
    .map((model) => {
      const input = parseOpenRouterPrice(model.pricing?.prompt);
      const output = parseOpenRouterPrice(model.pricing?.completion);
      const name = model.name ?? model.id;
      return {
        id: model.id,
        name: name.includes(": ") ? name.slice(name.indexOf(": ") + 2) : name,
        pricing: input != null && output != null ? { input, output } : null,
      };
    });
}

/** Lists the models a hosted connector offers; empty for manual endpoints. */
export async function listConnectorModels(
  connectorType: AiConnectorType,
): Promise<CatalogModel[]> {
  if (connectorType === "AI_GATEWAY") return listGatewayModels();
  if (connectorType === "OPENROUTER") return listOpenRouterModels();
  return [];
}

/** Fetches the remaining AI Gateway credit balance (USD) for an API key. */
export async function fetchGatewayCredits(apiKey: string): Promise<number | null> {
  const response = await fetch(`${AI_GATEWAY_BASE_URL}/credits`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`AI Gateway credits request failed (${response.status})`);
  }
  const body = (await response.json()) as { balance?: unknown };
  return parsePrice(body.balance);
}

/**
 * Fetches the remaining OpenRouter balance (USD) for an API key. OpenRouter
 * reports lifetime credits purchased and lifetime usage, so the balance is the
 * difference.
 */
export async function fetchOpenRouterCredits(
  apiKey: string,
): Promise<number | null> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/credits`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`OpenRouter credits request failed (${response.status})`);
  }
  const body = (await response.json()) as {
    data?: { total_credits?: unknown; total_usage?: unknown };
  };
  const credits = parsePrice(body.data?.total_credits);
  const usage = parsePrice(body.data?.total_usage);
  if (credits == null || usage == null) return null;
  return credits - usage;
}

/**
 * Refreshes and caches the credit balance for an org. Returns the balance, or
 * null if the org isn't on a connector that reports credits, or the lookup fails.
 */
export async function refreshAiCredits(
  organizationId: string,
): Promise<number | null> {
  const connector = await getAiConnector(organizationId);
  if (
    !connector ||
    !isHostedConnector(connector.connectorType) ||
    !connector.apiKeyEncrypted
  ) {
    return null;
  }

  try {
    const apiKey = decryptSecret(connector.apiKeyEncrypted);
    const balance =
      connector.connectorType === "OPENROUTER"
        ? await fetchOpenRouterCredits(apiKey)
        : await fetchGatewayCredits(apiKey);
    await db
      .update(aiConnectors)
      .set({ creditsBalance: balance, creditsCheckedAt: new Date() })
      .where(eq(aiConnectors.organizationId, organizationId));
    return balance;
  } catch {
    return null;
  }
}

/**
 * Reads the *cached* balance and returns a warning when it is below the low
 * threshold. Never makes a network call, so it's safe to call during render.
 */
export async function getAiBalanceWarning(
  organizationId: string,
): Promise<{ balance: number } | null> {
  const connector = await getAiConnector(organizationId);
  if (
    !connector ||
    !isHostedConnector(connector.connectorType) ||
    connector.creditsBalance == null
  ) {
    return null;
  }
  return connector.creditsBalance < AI_CREDITS_LOW_THRESHOLD
    ? { balance: connector.creditsBalance }
    : null;
}
