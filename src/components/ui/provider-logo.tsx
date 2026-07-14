"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Brand marks for AI Gateway providers, served from the lobehub static-svg CDN.
// The `icon` slug picks the exact file: a `-color` suffix uses the brand-coloured
// variant; the plain slug is a monochrome mark (rendered on a white chip so it
// stays legible in both light and dark themes). Providers without a mapped icon
// fall back to a coloured monogram.
const LOBE_ICONS_BASE =
  "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.91.0/icons";

type ProviderMeta = { label: string; icon?: string };

// Keyed by the AI Gateway provider slug (the part before "/" in a model id).
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
};

function titleCase(slug: string) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Human-readable label for an AI Gateway provider slug. */
export function providerLabel(slug: string): string {
  return PROVIDER_META[slug]?.label ?? (slug ? titleCase(slug) : "Other");
}

export function ProviderLogo({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  const meta = PROVIDER_META[provider];
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
