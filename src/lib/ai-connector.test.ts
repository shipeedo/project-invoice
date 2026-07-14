import { describe, expect, it } from "vitest";
import {
  computeAiCallCostUsd,
  getAiCallCostUsd,
  getAiConnector,
  perMillionToPerToken,
  perTokenToPerMillion,
  saveAiConnector,
} from "@/lib/ai-connector";
import { db, organizations } from "@/lib/db";

async function createOrg(slug: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `Test ${slug}`, slug })
    .returning();
  return org;
}

describe("per-1M ↔ per-token price conversion", () => {
  it("converts a per-1M quote to the stored per-token rate", () => {
    expect(perMillionToPerToken(0.6)).toBeCloseTo(0.0000006, 12);
    expect(perMillionToPerToken(2.4)).toBeCloseTo(0.0000024, 12);
    expect(perMillionToPerToken(0)).toBe(0);
  });

  it("round-trips back to the quoted per-1M figure", () => {
    expect(perTokenToPerMillion(perMillionToPerToken(0.6))).toBeCloseTo(0.6, 9);
    expect(perTokenToPerMillion(perMillionToPerToken(15))).toBeCloseTo(15, 9);
  });
});

describe("computeAiCallCostUsd", () => {
  const pricing = { input: 0.0000006, output: 0.0000024 };

  it("prices prompt and completion tokens separately", () => {
    const cost = computeAiCallCostUsd(pricing, {
      promptTokens: 10_000,
      completionTokens: 1_000,
    });
    // 10k * $0.60/M + 1k * $2.40/M
    expect(cost).toBeCloseTo(0.006 + 0.0024, 9);
  });

  it("returns null without pricing or usage", () => {
    expect(
      computeAiCallCostUsd(null, { promptTokens: 10, completionTokens: 10 }),
    ).toBeNull();
    expect(computeAiCallCostUsd(pricing, null)).toBeNull();
  });
});

describe("getAiCallCostUsd", () => {
  const usage = { promptTokens: 12_000, completionTokens: 431 };

  it("computes cost for an OPENAI_COMPATIBLE connector with manual pricing", async () => {
    const org = await createOrg("cost-openai-priced");
    await saveAiConnector({
      organizationId: org.id,
      connectorType: "OPENAI_COMPATIBLE",
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "Qwen3-35B",
      pricing: {
        input: perMillionToPerToken(0.6),
        output: perMillionToPerToken(2.4),
      },
    });

    const cost = await getAiCallCostUsd(org.id, usage);
    expect(cost).toBeCloseTo(12_000 * 0.0000006 + 431 * 0.0000024, 9);
  });

  it("returns null when the connector has no pricing", async () => {
    const org = await createOrg("cost-openai-unpriced");
    await saveAiConnector({
      organizationId: org.id,
      connectorType: "OPENAI_COMPATIBLE",
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "Qwen3-35B",
      pricing: null,
    });

    await expect(getAiCallCostUsd(org.id, usage)).resolves.toBeNull();
  });

  it("returns null without usage or without a connector", async () => {
    const org = await createOrg("cost-no-connector");
    await expect(getAiCallCostUsd(org.id, usage)).resolves.toBeNull();
    await expect(getAiCallCostUsd(org.id, null)).resolves.toBeNull();
  });
});

describe("saveAiConnector pricing persistence", () => {
  it("persists manual per-token prices for OPENAI_COMPATIBLE and clears them when unset", async () => {
    const org = await createOrg("save-openai-pricing");
    await saveAiConnector({
      organizationId: org.id,
      connectorType: "OPENAI_COMPATIBLE",
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "Qwen3-35B",
      pricing: { input: 0.0000006, output: 0.0000024 },
    });

    let connector = await getAiConnector(org.id);
    expect(connector?.modelInputPrice).toBeCloseTo(0.0000006, 12);
    expect(connector?.modelOutputPrice).toBeCloseTo(0.0000024, 12);

    // Re-saving without pricing clears the stored rates.
    await saveAiConnector({
      organizationId: org.id,
      connectorType: "OPENAI_COMPATIBLE",
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "Qwen3-35B",
      pricing: null,
    });

    connector = await getAiConnector(org.id);
    expect(connector?.modelInputPrice).toBeNull();
    expect(connector?.modelOutputPrice).toBeNull();
  });

  it("keeps the gateway snapshot behavior", async () => {
    const org = await createOrg("save-gateway-pricing");
    await saveAiConnector({
      organizationId: org.id,
      connectorType: "AI_GATEWAY",
      model: "openai/gpt-4o-mini",
      pricing: { input: 0.00000015, output: 0.0000006 },
    });

    const connector = await getAiConnector(org.id);
    expect(connector?.modelInputPrice).toBeCloseTo(0.00000015, 12);
    expect(connector?.modelOutputPrice).toBeCloseTo(0.0000006, 12);
  });
});
