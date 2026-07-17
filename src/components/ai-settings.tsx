"use client";

import {
  AlertTriangleIcon,
  CheckIcon,
  LayersIcon,
  Loader2Icon,
  RefreshCwIcon,
  WalletIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  ProviderLogo,
  normalizeProviderSlug,
  providerLabel,
} from "@/components/ui/provider-logo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiConnectorType } from "@/lib/db/types";
import { cn } from "@/lib/utils";

// Mirrors AI_CREDITS_LOW_THRESHOLD in @/lib/ai-connector, kept local so this
// client component never pulls the DB-importing module into the browser bundle.
const AI_CREDITS_LOW_THRESHOLD = 10;

export type AiConnectorSummaryView = {
  connectorType: AiConnectorType;
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
  pricing: { input: number; output: number } | null;
  creditsBalance: number | null;
  creditsCheckedAt: string | null;
};

type ConnectorSummary = AiConnectorSummaryView;

type CatalogModel = {
  id: string;
  name: string;
  pricing: { input: number; output: number } | null;
};

// A catalog model shaped for the combobox. `value`/`label` follow the base-ui
// convention (value submitted/matched, label shown in the input and list).
type ModelOption = {
  value: string;
  label: string;
  provider: string;
  providerLabel: string;
  pricing: { input: number; output: number } | null;
};

// An entry in the provider rail on the left of the model picker.
type ProviderEntry = {
  slug: string;
  label: string;
  count: number;
};

// Cheapest models first: by output price, then input price (unpriced last),
// then name so the order is stable.
function byPriceAscending(a: ModelOption, b: ModelOption) {
  const aOutput = a.pricing?.output ?? Infinity;
  const bOutput = b.pricing?.output ?? Infinity;
  if (aOutput !== bOutput) return aOutput - bOutput;
  const aInput = a.pricing?.input ?? Infinity;
  const bInput = b.pricing?.input ?? Infinity;
  if (aInput !== bInput) return aInput - bInput;
  return a.label.localeCompare(b.label);
}

const CONNECTOR_TYPE_LABELS: Record<AiConnectorType, string> = {
  AI_GATEWAY: "Vercel AI Gateway",
  OPENROUTER: "OpenRouter",
  OPENAI_COMPATIBLE: "OpenAI-compatible endpoint",
};

// The provider slug is the part before "/" in a model id, canonicalized so the
// rail groups a vendor into one entry however the catalog spells it.
function modelProviderSlug(modelId: string) {
  return modelId.includes("/")
    ? normalizeProviderSlug(modelId.split("/")[0])
    : "";
}

function toModelOption(model: CatalogModel): ModelOption {
  const provider = modelProviderSlug(model.id);
  return {
    value: model.id,
    label: model.name,
    provider,
    providerLabel: providerLabel(provider),
    pricing: model.pricing,
  };
}

type AiSettingsProps = {
  initialConnector: ConnectorSummary | null;
  /** Called with the saved summary after a successful save (e.g. to collapse an edit form). */
  onSaved?: (summary: ConnectorSummary | null) => void;
  /** When provided, a Cancel button is shown that invokes this. */
  onCancel?: () => void;
};

// Per-token gateway pricing is tiny; show cost per million tokens, which is how
// providers usually quote it.
function formatPerMillion(perToken: number) {
  return `$${(perToken * 1_000_000).toFixed(2)}/M`;
}

// Stored per-token USD → the per-1M figure the admin typed, for editing.
// toPrecision trims the float noise that per-token division introduces
// (e.g. 0.6 / 1e6 * 1e6 => "0.5999999...").
function perTokenToPerMillionText(perToken: number | null | undefined) {
  if (perToken == null) return "";
  return String(Number((perToken * 1_000_000).toPrecision(12)));
}

// Blank is valid (no price); otherwise the field must parse to a
// non-negative finite number.
function parsePriceText(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function AiSettings({
  initialConnector,
  onSaved,
  onCancel,
}: AiSettingsProps) {
  const [connectorType, setConnectorType] = useState<AiConnectorType>(
    initialConnector?.connectorType ?? "AI_GATEWAY",
  );
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(initialConnector?.baseUrl ?? "");
  const [model, setModel] = useState(initialConnector?.model ?? "");
  const [hasApiKey, setHasApiKey] = useState(initialConnector?.hasApiKey ?? false);
  const [pricing, setPricing] = useState(initialConnector?.pricing ?? null);
  // Manual pricing for OpenAI-compatible endpoints, edited as USD per 1M tokens.
  const [inputPriceText, setInputPriceText] = useState(
    initialConnector?.connectorType === "OPENAI_COMPATIBLE"
      ? perTokenToPerMillionText(initialConnector?.pricing?.input)
      : "",
  );
  const [outputPriceText, setOutputPriceText] = useState(
    initialConnector?.connectorType === "OPENAI_COMPATIBLE"
      ? perTokenToPerMillionText(initialConnector?.pricing?.output)
      : "",
  );
  const [creditsBalance, setCreditsBalance] = useState(
    initialConnector?.creditsBalance ?? null,
  );

  const [models, setModels] = useState<CatalogModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [creditsLoading, setCreditsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  // The AI Gateway and OpenRouter are hosted: fixed endpoint, models picked from
  // the provider's catalog, credits reported by the provider. Everything else is
  // an endpoint the admin describes by hand.
  // Mirrors isHostedConnector in @/lib/ai-config, kept local so this client
  // component never pulls the DB-importing module into the browser bundle.
  const isHosted = connectorType !== "OPENAI_COMPATIBLE";

  // Anchor the model popup to the whole input group so it opens at the full
  // width of the field rather than sizing to the inner input.
  const modelPickerAnchor = useComboboxAnchor();

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const response = await fetch(
        `/api/admin/ai/models?type=${encodeURIComponent(connectorType)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load models");
      setModels(data.models as CatalogModel[]);
    } catch (error) {
      setModels([]);
      setModelsError(
        error instanceof Error ? error.message : "Failed to load models",
      );
    } finally {
      setModelsLoading(false);
    }
  }, [connectorType]);

  useEffect(() => {
    // Fetching the provider's model list from the server is a legitimate
    // external-system sync; loadModels manages its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isHosted) void loadModels();
  }, [isHosted, loadModels]);

  const refreshCredits = useCallback(async () => {
    setCreditsLoading(true);
    try {
      const response = await fetch("/api/admin/ai/credits");
      const data = await response.json();
      if (response.ok) setCreditsBalance(data.balance as number);
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  const modelOptions = useMemo(() => models.map(toModelOption), [models]);

  // Providers for the rail, sorted alphabetically by display label.
  const providers = useMemo<ProviderEntry[]>(() => {
    const bySlug = new Map<string, ProviderEntry>();
    for (const option of modelOptions) {
      const entry = bySlug.get(option.provider);
      if (entry) {
        entry.count += 1;
      } else {
        bySlug.set(option.provider, {
          slug: option.provider,
          label: option.providerLabel,
          count: 1,
        });
      }
    }
    return [...bySlug.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [modelOptions]);

  // Which provider the rail has narrowed the list to; null means all.
  const [railProvider, setRailProvider] = useState<string | null>(null);
  const activeProvider = providers.some((p) => p.slug === railProvider)
    ? railProvider
    : null;

  // Models shown in the right column: narrowed by the rail, cheapest first.
  const visibleModels = useMemo(() => {
    const list =
      activeProvider === null
        ? [...modelOptions]
        : modelOptions.filter((option) => option.provider === activeProvider);
    return list.sort(byPriceAscending);
  }, [modelOptions, activeProvider]);

  // The option matching the saved model, or a synthetic one so the current
  // selection still shows before/without the gateway list loading.
  const selectedModel = useMemo<ModelOption | null>(() => {
    if (!model) return null;
    const match = modelOptions.find((item) => item.value === model);
    if (match) return match;
    const provider = modelProviderSlug(model);
    return {
      value: model,
      label: model,
      provider,
      providerLabel: providerLabel(provider),
      pricing,
    };
  }, [model, modelOptions, pricing]);

  // Model ids, prices, and credits all belong to one provider, so switching
  // provider clears them — except back to the saved one, which restores what
  // was configured.
  function changeConnectorType(next: AiConnectorType) {
    if (next === connectorType) return;
    const saved = initialConnector?.connectorType === next ? initialConnector : null;
    setConnectorType(next);
    setModels([]);
    setModelsError(null);
    setRailProvider(null);
    setModel(saved?.model ?? "");
    setPricing(saved?.pricing ?? null);
    setCreditsBalance(saved?.creditsBalance ?? null);
    setInputPriceText(
      next === "OPENAI_COMPATIBLE"
        ? perTokenToPerMillionText(saved?.pricing?.input)
        : "",
    );
    setOutputPriceText(
      next === "OPENAI_COMPATIBLE"
        ? perTokenToPerMillionText(saved?.pricing?.output)
        : "",
    );
  }

  function selectModel(option: ModelOption | null) {
    if (!option) {
      setModel("");
      setPricing(null);
      return;
    }
    setModel(option.value);
    setPricing(option.pricing ?? null);
  }

  // Match the typed query against the model name, id, and provider label so a
  // user can search by any of them.
  const filterModel = useCallback((option: ModelOption, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      option.label.toLowerCase().includes(q) ||
      option.value.toLowerCase().includes(q) ||
      option.providerLabel.toLowerCase().includes(q)
    );
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorType,
          baseUrl: isHosted ? null : baseUrl,
          model,
          // Only send a key when the admin typed a new one; blank keeps the existing.
          apiKey: apiKey.trim() ? apiKey.trim() : null,
          // Manual per-1M pricing only applies to OpenAI-compatible endpoints;
          // the server snapshots gateway pricing itself.
          inputPricePerMillion: isHosted ? null : (parsePriceText(inputPriceText) ?? null),
          outputPricePerMillion: isHosted ? null : (parsePriceText(outputPriceText) ?? null),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to save");

      const saved = data.connector as ConnectorSummary | null;
      setHasApiKey(saved?.hasApiKey ?? false);
      setPricing(saved?.pricing ?? null);
      setCreditsBalance(saved?.creditsBalance ?? null);
      setApiKey("");
      if (saved?.connectorType === "OPENAI_COMPATIBLE") {
        setInputPriceText(perTokenToPerMillionText(saved.pricing?.input));
        setOutputPriceText(perTokenToPerMillionText(saved.pricing?.output));
      }
      if (onSaved) {
        onSaved(saved);
      } else {
        setMessage({ type: "success", text: "AI connector saved." });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save",
      });
    } finally {
      setSaving(false);
    }
  }

  const lowBalance =
    creditsBalance != null && creditsBalance < AI_CREDITS_LOW_THRESHOLD;

  // undefined marks an unparseable entry; both prices must be set together
  // because cost can only be computed with both.
  const parsedInputPrice = parsePriceText(inputPriceText);
  const parsedOutputPrice = parsePriceText(outputPriceText);
  const pricesValid =
    isHosted ||
    (parsedInputPrice !== undefined &&
      parsedOutputPrice !== undefined &&
      (parsedInputPrice === null) === (parsedOutputPrice === null));

  const canSave =
    Boolean(model) &&
    (isHosted || Boolean(baseUrl.trim())) &&
    (hasApiKey || Boolean(apiKey.trim())) &&
    pricesValid;

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label>Provider</Label>
        <Select
          value={connectorType}
          onValueChange={(value) => changeConnectorType(value as AiConnectorType)}
        >
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue>
              {(value: AiConnectorType | null) =>
                value ? CONNECTOR_TYPE_LABELS[value] : "Select a provider"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AI_GATEWAY">
              {CONNECTOR_TYPE_LABELS.AI_GATEWAY}
            </SelectItem>
            <SelectItem value="OPENROUTER">
              {CONNECTOR_TYPE_LABELS.OPENROUTER}
            </SelectItem>
            <SelectItem value="OPENAI_COMPATIBLE">
              {CONNECTOR_TYPE_LABELS.OPENAI_COMPATIBLE}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ai-api-key">API key</Label>
        <Input
          id="ai-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            hasApiKey ? "•••••••••• (leave blank to keep current)" : "Enter API key"
          }
        />
        {hasApiKey ? (
          <p className="text-xs text-muted-foreground">
            A key is stored and encrypted. Leave blank to keep it.
          </p>
        ) : null}
      </div>

      {!isHosted ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="ai-base-url">Base URL</Label>
            <Input
              id="ai-base-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="http://127.0.0.1:8000/v1"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-model-name">Model name</Label>
            <Input
              id="ai-model-name"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="e.g. Qwen3-35B"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ai-input-price">Input price (USD per 1M tokens)</Label>
              <Input
                id="ai-input-price"
                inputMode="decimal"
                value={inputPriceText}
                onChange={(event) => setInputPriceText(event.target.value)}
                placeholder="e.g. 0.60"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-output-price">Output price (USD per 1M tokens)</Label>
              <Input
                id="ai-output-price"
                inputMode="decimal"
                value={outputPriceText}
                onChange={(event) => setOutputPriceText(event.target.value)}
                placeholder="e.g. 2.40"
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Optional — used to show extraction cost in the processing queue.
              Set both prices or leave both blank.
            </p>
          </div>
        </>
      ) : (
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Model</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadModels()}
              disabled={modelsLoading}
            >
              <RefreshCwIcon
                className={cn("size-3.5", modelsLoading && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
          <Combobox
            items={visibleModels}
            value={selectedModel}
            onValueChange={selectModel}
            itemToStringLabel={(item: ModelOption) => item.label}
            itemToStringValue={(item: ModelOption) => item.value}
            isItemEqualToValue={(item: ModelOption, value: ModelOption) =>
              item.value === value.value
            }
            filter={filterModel}
            disabled={modelsLoading || models.length === 0}
          >
            <div ref={modelPickerAnchor} className="w-full">
              <ComboboxInput
                className="w-full"
                placeholder={
                  modelsLoading
                    ? "Loading models…"
                    : models.length === 0
                      ? "No models available"
                      : "Search models by name, id, or provider…"
                }
                showClear={Boolean(model)}
                disabled={modelsLoading || models.length === 0}
              >
                {selectedModel ? (
                  <InputGroupAddon align="inline-start">
                    <ProviderLogo
                      provider={selectedModel.provider}
                      className="size-5"
                    />
                  </InputGroupAddon>
                ) : null}
              </ComboboxInput>
            </div>
            <ComboboxContent anchor={modelPickerAnchor}>
              <div className="flex max-h-[min(--spacing(80),var(--available-height))]">
                <div
                  className="no-scrollbar w-36 shrink-0 space-y-0.5 overflow-y-auto border-r p-1 sm:w-44"
                  role="group"
                  aria-label="Filter models by provider"
                >
                  <ProviderRailButton
                    active={activeProvider === null}
                    onSelect={() => setRailProvider(null)}
                    icon={
                      <span className="flex size-5 shrink-0 items-center justify-center">
                        <LayersIcon className="size-4" />
                      </span>
                    }
                    label="All providers"
                    count={modelOptions.length}
                  />
                  {providers.map((provider) => (
                    <ProviderRailButton
                      key={provider.slug}
                      active={activeProvider === provider.slug}
                      onSelect={() => setRailProvider(provider.slug)}
                      icon={
                        <ProviderLogo
                          provider={provider.slug}
                          className="size-5"
                        />
                      }
                      label={provider.label}
                      count={provider.count}
                    />
                  ))}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <ComboboxEmpty>No matching models.</ComboboxEmpty>
                  <ComboboxList className="max-h-none flex-1">
                    {(item: ModelOption) => (
                      <ComboboxItem key={item.value} value={item}>
                        <ProviderLogo
                          provider={item.provider}
                          className="size-5"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        {item.pricing ? (
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            in {formatPerMillion(item.pricing.input)} · out{" "}
                            {formatPerMillion(item.pricing.output)}
                          </span>
                        ) : null}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </div>
              </div>
            </ComboboxContent>
          </Combobox>
          {modelsError ? (
            <p className="text-xs text-destructive">{modelsError}</p>
          ) : null}
          {pricing ? (
            <p className="text-xs text-muted-foreground">
              Pricing: input {formatPerMillion(pricing.input)} · output{" "}
              {formatPerMillion(pricing.output)} tokens
            </p>
          ) : null}
        </div>
      )}

      {message ? (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        ) : null}
        <Button onClick={() => void save()} disabled={saving || !canSave}>
          {saving ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <CheckIcon className="size-4" />
          )}
          Save
        </Button>
      </div>

      {isHosted ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <WalletIcon className="size-4" />
              Credits
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Remaining balance on your {CONNECTOR_TYPE_LABELS[connectorType]}{" "}
              account.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold">
              {creditsBalance != null ? `$${creditsBalance.toFixed(2)}` : "—"}
            </span>
            {lowBalance ? (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangleIcon className="size-3.5" />
                Low balance
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => void refreshCredits()}
              disabled={creditsLoading}
            >
              <RefreshCwIcon
                className={cn("size-3.5", creditsLoading && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
          {lowBalance ? (
            <p className="text-xs text-destructive">
              Balance is below ${AI_CREDITS_LOW_THRESHOLD.toFixed(2)}. Top up to
              keep invoice extraction running.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// A provider filter button in the rail on the left of the model list. Not a
// combobox item: it narrows the list instead of selecting a value, and
// prevents mousedown so the search input keeps focus and the popup stays open.
function ProviderRailButton({
  active,
  onSelect,
  icon,
  label,
  count,
}: {
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        <span className="block text-xs font-normal text-muted-foreground tabular-nums">
          {count} {count === 1 ? "model" : "models"}
        </span>
      </span>
    </button>
  );
}
