import type { ExtractedLineItem, LineItemStatus } from "@/lib/extraction";

export function parseLineItems(raw: string | null | undefined): ExtractedLineItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ExtractedLineItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveLineItemStatus(item: ExtractedLineItem): LineItemStatus {
  return item.status ?? "PENDING";
}
