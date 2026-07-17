import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getAiConnector,
  listConnectorModels,
  perMillionToPerToken,
  refreshAiCredits,
  saveAiConnector,
  toAiConnectorSummary,
} from "@/lib/ai-connector";
import { isHostedConnector } from "@/lib/ai-config";
import { aiConnectorTypes, type AiConnectorType } from "@/lib/db/types";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const connector = await getAiConnector(gate.session.user.organizationId);
  // The encrypted API key is intentionally never included in the response.
  return NextResponse.json({ connector: toAiConnectorSummary(connector) });
}

export async function PUT(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = (await request.json().catch(() => null)) as {
    connectorType?: string;
    baseUrl?: string | null;
    model?: string | null;
    apiKey?: string | null;
    /** Manual pricing for OPENAI_COMPATIBLE connectors, in USD per 1M tokens. */
    inputPricePerMillion?: number | null;
    outputPricePerMillion?: number | null;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!aiConnectorTypes.includes(body.connectorType as AiConnectorType)) {
    return NextResponse.json({ error: "Invalid connector type" }, { status: 400 });
  }
  const connectorType = body.connectorType as AiConnectorType;

  const model = body.model?.trim() || null;
  const hosted = isHostedConnector(connectorType);

  if (!hosted && !body.baseUrl?.trim()) {
    return NextResponse.json(
      { error: "A base URL is required for an OpenAI-compatible connector" },
      { status: 400 },
    );
  }

  // Hosted-connector pricing is snapshotted server-side from the provider's
  // model list so the client can't spoof cost figures; OpenAI-compatible
  // endpoints have no price feed, so the admin enters per-1M prices manually.
  let pricing: { input: number; output: number } | null = null;
  if (hosted && model) {
    try {
      const models = await listConnectorModels(connectorType);
      pricing = models.find((m) => m.id === model)?.pricing ?? null;
    } catch {
      pricing = null;
    }
  } else if (!hosted) {
    const input = body.inputPricePerMillion ?? null;
    const output = body.outputPricePerMillion ?? null;
    const isValidPrice = (value: number | null) =>
      value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
    if (!isValidPrice(input) || !isValidPrice(output)) {
      return NextResponse.json(
        { error: "Prices must be non-negative numbers (USD per 1M tokens)" },
        { status: 400 },
      );
    }
    if ((input === null) !== (output === null)) {
      return NextResponse.json(
        { error: "Provide both input and output prices, or leave both blank" },
        { status: 400 },
      );
    }
    if (input !== null && output !== null) {
      pricing = {
        input: perMillionToPerToken(input),
        output: perMillionToPerToken(output),
      };
    }
  }

  await saveAiConnector({
    organizationId: gate.session.user.organizationId,
    configuredById: gate.session.user.id,
    connectorType,
    baseUrl: body.baseUrl ?? null,
    model,
    apiKey: body.apiKey ?? null,
    pricing,
  });

  // Refresh the cached balance so the sidebar warning reflects the new key/model.
  if (hosted) {
    await refreshAiCredits(gate.session.user.organizationId);
  }

  const connector = await getAiConnector(gate.session.user.organizationId);
  return NextResponse.json({ connector: toAiConnectorSummary(connector) });
}
