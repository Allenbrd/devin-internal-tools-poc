/**
 * Pure refund rules (no server imports): shared by actions, pages, seed and tests.
 */
export const REFUND_STATUSES = ["requested", "approved", "rejected", "paid"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** All have 2 decimal places, so amounts are stored as integer minor units. */
export const REFUND_CURRENCIES = ["EUR", "GBP", "USD", "CHF"] as const;
export type RefundCurrency = (typeof REFUND_CURRENCIES)[number];

export const REFUND_REASON_CODES = ["duplicate_charge", "not_received", "goodwill", "fraud"] as const;
export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number];

export const REASON_CODE_LABELS: Record<RefundReasonCode, string> = {
  duplicate_charge: "Duplicate charge",
  not_received: "Not received",
  goodwill: "Goodwill",
  fraud: "Fraud",
};

export const isReasonCode = (v: unknown): v is RefundReasonCode =>
  typeof v === "string" && (REFUND_REASON_CODES as readonly string[]).includes(v);

/** Amount (major units, any currency) at or above which a reason code is required. Not tied to the approval threshold. */
export const REASON_CODE_REQUIRED_FROM = 500;

export function reasonCodeRequired(amountMinor: number): boolean {
  return amountMinor >= REASON_CODE_REQUIRED_FROM * 100;
}

export const MAX_REFUND_MINOR = 100_000_000; // 1,000,000.00

/** Amount (major units, any currency) at or above which two approvals are needed. */
export const DEFAULT_DUAL_APPROVAL_THRESHOLD = 500;

/** Threshold in minor units, from REFUND_DUAL_APPROVAL_THRESHOLD (major units). Fails closed on bad config. */
export function dualApprovalThresholdMinor(env: Record<string, string | undefined> = process.env): number {
  const raw = env.REFUND_DUAL_APPROVAL_THRESHOLD?.trim();
  if (!raw) return DEFAULT_DUAL_APPROVAL_THRESHOLD * 100;
  const minor = parseAmountToMinor(raw);
  if (minor === null) throw new Error(`Invalid REFUND_DUAL_APPROVAL_THRESHOLD "${raw}"`);
  return minor;
}

export function requiredApprovalsFor(amountMinor: number, thresholdMinor = dualApprovalThresholdMinor()): 1 | 2 {
  return amountMinor >= thresholdMinor ? 2 : 1;
}

/** "1250", "1250.5", "1,250.50" -> 125050. Null if not a positive amount with at most 2 decimals. */
export function parseAmountToMinor(input: string): number | null {
  const value = input.trim().replace(/,/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return minor > 0 && minor <= MAX_REFUND_MINOR ? minor : null;
}

export function formatAmount(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amountMinor / 100);
}

export type DecisionBlock = "not_pending" | "self_approval" | "already_decided";

/**
 * Four-eyes rules for an approve/reject decision by `actorId`:
 * only pending refunds, never the requester, at most one decision per approver.
 */
export function checkDecision(
  refund: { status: string; requestedById: string },
  decisions: readonly { approverId: string }[],
  actorId: string,
): { ok: true } | { ok: false; reason: DecisionBlock } {
  if (refund.status !== "requested") return { ok: false, reason: "not_pending" };
  if (refund.requestedById === actorId) return { ok: false, reason: "self_approval" };
  if (decisions.some((d) => d.approverId === actorId)) return { ok: false, reason: "already_decided" };
  return { ok: true };
}

export function statusAfterDecision(
  decision: "approve" | "reject",
  decisions: readonly { decision: string }[],
  requiredApprovals: number,
): RefundStatus {
  if (decision === "reject") return "rejected";
  const approvals = decisions.filter((d) => d.decision === "approve").length;
  return approvals >= requiredApprovals ? "approved" : "requested";
}

export const DECISION_BLOCK_MESSAGES: Record<DecisionBlock, string> = {
  not_pending: "This refund is no longer awaiting a decision.",
  self_approval: "You requested this refund, so another approver must decide it.",
  already_decided: "You have already decided on this refund; a different approver is needed.",
};
