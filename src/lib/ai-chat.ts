import { getAiConfig, shouldUseJsonResponseFormat } from "@/lib/ai-config";

export async function callAiChatCompletion(params: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<
  { content: string; raw: unknown } | { error: string; raw: unknown | null }
> {
  const config = getAiConfig();
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

    if (shouldUseJsonResponseFormat(config.chatCompletionsUrl)) {
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
      };
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return {
        error: `${config.providerLabel} returned an empty response`,
        raw: completion,
      };
    }

    return { content, raw: completion };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "AI request failed",
      raw: null,
    };
  }
}
