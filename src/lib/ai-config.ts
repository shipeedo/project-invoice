import { eq } from "drizzle-orm";
import { aiConnectors, db } from "@/lib/db";
import type { AiConnectorType } from "@/lib/db/types";
import { decryptSecret } from "@/lib/crypto";

export const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
export const AI_GATEWAY_CHAT_COMPLETIONS_URL = `${AI_GATEWAY_BASE_URL}/chat/completions`;

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_CHAT_COMPLETIONS_URL = `${OPENROUTER_BASE_URL}/chat/completions`;

/**
 * Connectors whose endpoint and model catalog are fixed by us: the admin picks a
 * model from the provider's list instead of typing a base URL, model name, and
 * prices by hand.
 */
export function isHostedConnector(type: AiConnectorType): boolean {
  return type === "AI_GATEWAY" || type === "OPENROUTER";
}

export type AiConfig = {
  apiKey: string;
  chatCompletionsUrl: string;
  model: string;
  providerLabel: string;
  connectorType: AiConnectorType;
  /**
   * Per-token USD pricing when configured — snapshotted from the gateway for
   * AI_GATEWAY, entered manually for OPENAI_COMPATIBLE.
   */
  pricing: { input: number; output: number } | null;
};

/**
 * Resolves the AI extraction config for an organization from the database.
 * The database is the sole source of truth — there is no environment fallback.
 */
export async function resolveAiConfig(
  organizationId: string,
): Promise<AiConfig | { error: string }> {
  const connector = await db.query.aiConnectors.findFirst({
    where: eq(aiConnectors.organizationId, organizationId),
  });

  if (!connector) {
    return { error: "AI extraction is not configured" };
  }

  if (!connector.apiKeyEncrypted) {
    return { error: "AI extraction API key is not configured" };
  }
  if (!connector.model) {
    return { error: "AI extraction model is not configured" };
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(connector.apiKeyEncrypted);
  } catch {
    return { error: "AI extraction API key could not be decrypted" };
  }

  const pricing =
    connector.modelInputPrice != null && connector.modelOutputPrice != null
      ? { input: connector.modelInputPrice, output: connector.modelOutputPrice }
      : null;

  if (connector.connectorType === "AI_GATEWAY") {
    return {
      apiKey,
      chatCompletionsUrl: AI_GATEWAY_CHAT_COMPLETIONS_URL,
      model: connector.model,
      providerLabel: "AI Gateway",
      connectorType: "AI_GATEWAY",
      pricing,
    };
  }

  if (connector.connectorType === "OPENROUTER") {
    return {
      apiKey,
      chatCompletionsUrl: OPENROUTER_CHAT_COMPLETIONS_URL,
      model: connector.model,
      providerLabel: "OpenRouter",
      connectorType: "OPENROUTER",
      pricing,
    };
  }

  const baseUrl = connector.baseUrl?.trim();
  if (!baseUrl) {
    return { error: "AI extraction base URL is not configured" };
  }

  return {
    apiKey,
    chatCompletionsUrl: `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    model: connector.model,
    providerLabel: "Local AI",
    connectorType: "OPENAI_COMPATIBLE",
    pricing,
  };
}

export function shouldUseJsonResponseFormat(
  connectorType: AiConnectorType,
): boolean {
  // The Vercel AI Gateway rejects response_format for some upstream providers,
  // so only OpenAI-compatible endpoints get the JSON response-format hint.
  return connectorType === "OPENAI_COMPATIBLE";
}
