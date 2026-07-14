"use client";

import { useState } from "react";
import { AlertTriangleIcon, PencilIcon, SparklesIcon } from "lucide-react";
import { SectionStatusBadge } from "@/components/section-status-badge";
import {
  AiSettings,
  type AiConnectorSummaryView,
} from "@/components/ai-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ProviderLogo,
  providerLabel as modelProviderLabel,
} from "@/components/ui/provider-logo";
import { cn } from "@/lib/utils";

const AI_CREDITS_LOW_THRESHOLD = 10;

function providerLabel(type: AiConnectorSummaryView["connectorType"]) {
  return type === "AI_GATEWAY"
    ? "Vercel AI Gateway"
    : "OpenAI-compatible endpoint";
}

type AiProviderSectionProps = {
  initialConnector: AiConnectorSummaryView | null;
};

export function AiProviderSection({ initialConnector }: AiProviderSectionProps) {
  const [connector, setConnector] = useState(initialConnector);
  const [editing, setEditing] = useState(false);

  const configured = Boolean(connector?.hasApiKey && connector?.model);
  const isGateway = connector?.connectorType === "AI_GATEWAY";
  const lowBalance =
    connector?.creditsBalance != null &&
    connector.creditsBalance < AI_CREDITS_LOW_THRESHOLD;
  // The model's provider slug (the part before "/" in a gateway model id),
  // used to show the brand mark of what actually reads the invoices.
  const modelProvider =
    isGateway && connector?.model?.includes("/")
      ? connector.model.split("/")[0]
      : null;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          AI provider
          <SectionStatusBadge
            status={configured && !lowBalance ? "ready" : "attention"}
          >
            {!configured
              ? "Not configured"
              : lowBalance
                ? "Low credits"
                : "Configured"}
          </SectionStatusBadge>
        </CardTitle>
        <CardDescription>
          The model that reads invoice details from documents and emails.
        </CardDescription>
        <CardAction>
          {!editing && configured ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon />
              Change
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        {editing ? (
          <AiSettings
            initialConnector={connector}
            onSaved={(saved) => {
              setConnector(saved);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : configured && connector ? (
          <div className="flex flex-wrap items-center gap-4">
            {modelProvider ? (
              <ProviderLogo
                provider={modelProvider}
                className="size-10 rounded-lg"
              />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <SparklesIcon className="size-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {modelProvider
                  ? modelProviderLabel(modelProvider)
                  : providerLabel(connector.connectorType)}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {connector.model}
                {modelProvider ? (
                  <span> · via {providerLabel(connector.connectorType)}</span>
                ) : null}
              </p>
            </div>
            {isGateway && connector.creditsBalance != null ? (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Credits</p>
                <div className="flex items-center justify-end gap-2">
                  <p
                    className={cn(
                      "text-lg font-semibold tabular-nums",
                      lowBalance && "text-destructive",
                    )}
                  >{`$${connector.creditsBalance.toFixed(2)}`}</p>
                  {lowBalance ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangleIcon className="size-3" />
                      Low
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <SparklesIcon className="size-5 text-muted-foreground" />
            </span>
            <div>
              <p className="font-medium">No AI provider configured</p>
              <p className="text-sm text-muted-foreground">
                Choose a provider and model to start extracting invoices.
              </p>
            </div>
            <Button size="sm" onClick={() => setEditing(true)}>
              Set up AI provider
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
