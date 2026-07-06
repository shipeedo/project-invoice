export const CREDIT_REASON_OPTIONS = [
  {
    code: "NOT_OUR_CONSIGNMENT",
    label: "Not our consignment",
    description: "Billed for a shipment that is not ours",
  },
  {
    code: "SERVICE_DOWNGRADE",
    label: "Service downgrade",
    description: "Express or service level did not meet SLA",
  },
  {
    code: "NOT_SENT_NO_TRACKING",
    label: "Not sent / no tracking",
    description: "Charge exists but the shipment did not occur",
  },
  {
    code: "OTHER",
    label: "Other",
    description: "Enter a custom reason",
  },
] as const;

export type CreditReasonCode = (typeof CREDIT_REASON_OPTIONS)[number]["code"];

export function isCreditReasonCode(value: string): value is CreditReasonCode {
  return CREDIT_REASON_OPTIONS.some((option) => option.code === value);
}

export function creditReasonLabel(code: CreditReasonCode | string | null | undefined) {
  if (!code) return "";
  const match = CREDIT_REASON_OPTIONS.find((option) => option.code === code);
  return match?.label ?? code;
}

export function formatCreditLineReason(params: {
  reason?: CreditReasonCode | string | null;
  reasonDetail?: string | null;
}) {
  if (params.reason === "OTHER") {
    return params.reasonDetail?.trim() || "Other";
  }
  return creditReasonLabel(params.reason);
}
