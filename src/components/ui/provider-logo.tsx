"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Brand marks for model providers, served from the lobehub static-svg CDN.
// The `icon` slug picks the exact file: a `-color` suffix uses the brand-coloured
// variant; the plain slug is a monochrome mark (rendered on a white chip so it
// stays legible in both light and dark themes). Providers without a mapped icon
// fall back to a coloured monogram.
const LOBE_ICONS_BASE =
  "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.91.0/icons";

type ProviderMeta = { label: string; icon?: string };

// Keyed by the provider slug (the part before "/" in a model id), as the AI
// Gateway spells it. OpenRouter's spellings are folded onto these by SLUG_ALIASES.
const PROVIDER_META: Record<string, ProviderMeta> = {
  openai: { label: "OpenAI", icon: "openai" },
  anthropic: { label: "Anthropic", icon: "anthropic" },
  google: { label: "Google Gemini", icon: "gemini-color" },
  alibaba: { label: "Qwen", icon: "qwen-color" },
  mistral: { label: "Mistral", icon: "mistral-color" },
  meta: { label: "Meta", icon: "meta-color" },
  deepseek: { label: "DeepSeek", icon: "deepseek-color" },
  xai: { label: "xAI", icon: "xai" },
  zai: { label: "Z.AI", icon: "zai" },
  minimax: { label: "MiniMax", icon: "minimax-color" },
  moonshotai: { label: "Moonshot AI", icon: "moonshot" },
  nvidia: { label: "NVIDIA", icon: "nvidia-color" },
  amazon: { label: "Amazon Bedrock", icon: "bedrock-color" },
  kwaipilot: { label: "KwaiPilot", icon: "kwaipilot-color" },
  perplexity: { label: "Perplexity", icon: "perplexity-color" },
  cohere: { label: "Cohere", icon: "cohere-color" },
  "arcee-ai": { label: "Arcee AI", icon: "arcee-color" },
  bytedance: { label: "ByteDance", icon: "bytedance-color" },
  stepfun: { label: "StepFun", icon: "stepfun-color" },
  morph: { label: "Morph", icon: "morph-color" },
  inception: { label: "Inception", icon: "inception" },
  xiaomi: { label: "Xiaomi" },
  interfaze: { label: "Interfaze" },
  sakana: { label: "Sakana AI" },
  // Providers OpenRouter carries that the gateway doesn't.
  openrouter: { label: "OpenRouter", icon: "openrouter" },
  microsoft: { label: "Microsoft", icon: "microsoft-color" },
  tencent: { label: "Tencent", icon: "hunyuan-color" },
  baidu: { label: "Baidu", icon: "baidu-color" },
  upstage: { label: "Upstage", icon: "upstage-color" },
  inflection: { label: "Inflection", icon: "inflection" },
  ai21: { label: "AI21 Labs", icon: "ai21" },
  allenai: { label: "Allen AI", icon: "ai2-color" },
  nousresearch: { label: "Nous Research" },
  rekaai: { label: "Reka AI" },
  "ibm-granite": { label: "IBM Granite" },
  "aion-labs": { label: "AionLabs" },
  inclusionai: { label: "InclusionAI" },
  cognitivecomputations: { label: "Cognitive Computations" },
  "anthracite-org": { label: "Anthracite" },
  sao10k: { label: "Sao10K" },
  thedrummer: { label: "TheDrummer" },
  undi95: { label: "Undi95" },
  nex: { label: "Nex AGI" },
};

// OpenRouter and the AI Gateway namespace the same vendors differently; fold the
// OpenRouter spelling onto the gateway's so both show one mark and one label.
const SLUG_ALIASES: Record<string, string> = {
  qwen: "alibaba",
  mistralai: "mistral",
  "z-ai": "zai",
  "meta-llama": "meta",
  "x-ai": "xai",
  "bytedance-seed": "bytedance",
  "nex-agi": "nex",
};

/**
 * The canonical slug for a provider: OpenRouter marks some namespaces with a
 * leading "~", and spells several vendors differently from the gateway. Group by
 * this so one vendor is one entry however the model list spells it.
 */
export function normalizeProviderSlug(slug: string): string {
  const bare = slug.startsWith("~") ? slug.slice(1) : slug;
  return SLUG_ALIASES[bare] ?? bare;
}

function titleCase(slug: string) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Human-readable label for a provider slug. */
export function providerLabel(slug: string): string {
  const canonical = normalizeProviderSlug(slug);
  return PROVIDER_META[canonical]?.label ?? (canonical ? titleCase(canonical) : "Other");
}

export function ProviderLogo({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  const meta = PROVIDER_META[normalizeProviderSlug(provider)];
  const label = providerLabel(provider);
  const src = meta?.icon ? `${LOBE_ICONS_BASE}/${meta.icon}.svg` : null;
  // Track the failed src rather than a boolean so changing the provider (and
  // thus the src) naturally retries without needing an effect to reset state.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const showImage = src !== null && failedSrc !== src;

  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center overflow-hidden rounded bg-white ring-1 ring-border/60",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote brand SVG, no optimization needed
        <img
          src={src}
          alt=""
          aria-hidden
          className="size-2/3"
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className="text-[0.625rem] font-semibold text-neutral-700">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}
