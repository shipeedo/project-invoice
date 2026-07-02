const DEFAULT_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const DEFAULT_GATEWAY_MODEL = "openai/gpt-4o-mini";

export type AiConfig = {
  apiKey: string;
  chatCompletionsUrl: string;
  model: string;
  providerLabel: string;
};

export function getAiConfig(): AiConfig | { error: string } {
  const localBaseUrl = process.env.AI_BASE_URL?.trim();

  if (localBaseUrl) {
    const apiKey = process.env.AI_API_KEY?.trim();
    if (!apiKey) {
      return { error: "AI_API_KEY is not configured (required when AI_BASE_URL is set)" };
    }

    const model = process.env.AI_MODEL?.trim();
    if (!model) {
      return { error: "AI_MODEL is not configured (required when AI_BASE_URL is set)" };
    }

    return {
      apiKey,
      chatCompletionsUrl: `${localBaseUrl.replace(/\/$/, "")}/chat/completions`,
      model,
      providerLabel: "Local AI",
    };
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    return { error: "AI_GATEWAY_API_KEY is not configured" };
  }

  const chatCompletionsUrl = process.env.AI_GATEWAY_URL ?? DEFAULT_GATEWAY_URL;
  const model =
    process.env.AI_MODEL?.trim() ??
    process.env.AI_GATEWAY_MODEL?.trim() ??
    DEFAULT_GATEWAY_MODEL;

  return {
    apiKey,
    chatCompletionsUrl,
    model,
    providerLabel: "AI Gateway",
  };
}

export function shouldUseJsonResponseFormat(chatCompletionsUrl: string): boolean {
  return !chatCompletionsUrl.includes("ai-gateway.vercel.sh");
}
