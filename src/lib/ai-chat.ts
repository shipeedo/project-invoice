import { resolveAiConfig, shouldUseJsonResponseFormat } from "@/lib/ai-config";

export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type AiChatSuccess = {
  content: string;
  raw: unknown;
  usage: AiUsage | null;
  model: string;
};

export type AiChatError = {
  error: string;
  raw: unknown | null;
  /** HTTP status of a failed provider response, e.g. 429 when rate limited. */
  status?: number;
};

export async function callAiChatCompletion(params: {
  organizationId: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<AiChatSuccess | AiChatError> {
  const config = await resolveAiConfig(params.organizationId);
  if ("error" in config) {
    return { error: config.error, raw: null };
  }

  try {
    const requestBody: Record<string, unknown> = {
      model: config.model,
      temperature: 0,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
    };

    if (shouldUseJsonResponseFormat(config.connectorType)) {
      requestBody.response_format = { type: "json_object" };
    }

    const response = await fetch(config.chatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        error: `${config.providerLabel} error (${response.status})`,
        raw: body,
        status: response.status,
      };
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return {
        error: `${config.providerLabel} returned an empty response`,
        raw: completion,
      };
    }

    const usage =
      typeof completion.usage?.prompt_tokens === "number" &&
      typeof completion.usage?.completion_tokens === "number"
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
          }
        : null;

    return { content, raw: completion, usage, model: config.model };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "AI request failed",
      raw: null,
    };
  }
}
