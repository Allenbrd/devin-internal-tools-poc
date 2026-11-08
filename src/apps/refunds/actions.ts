"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/platform/audit";
import type { Principal } from "@/platform/auth";
import { db, type DbClient } from "@/platform/db";
import { ForbiddenError, UnauthenticatedError, requirePermission } from "@/platform/permissions";
import { isValidIban, normalizeIban } from "@/platform/validation/iban";
import {
  DECISION_BLOCK_MESSAGES,
  REASON_CODE_REQUIRED_FROM,
  REFUND_CURRENCIES,
  REFUND_REASON_CODES,
  checkDecision,
  parseAmountToMinor,
  reasonCodeRequired,
  requiredApprovalsFor,
  statusAfterDecision,
} from "./policy";
import { refundResource } from "./sensitive";

export type RefundActionState = { ok: boolean; message?: string; errors?: Record<string, string[]> };

class ConcurrentChangeError extends Error {}

const CONFLICT_MESSAGE = "This refund was changed by someone else. Reload and try again.";

/** Runs a requirePermission(..., { onDenied: "throw" }) check; null when denied. */
async function authorize(check: () => Promise<Principal>): Promise<Principal | null> {
  try {
    return await check();
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) return null;
    throw error;
  }
}

const isUniqueViolation = (error: unknown) => (error as { code?: unknown } | null)?.code === "P2002";

type RefundState = { status: string; requiredApprovals: number };
type DecisionWithApprover = { decision: string; approver: { email: string } };

/** What the audit log records as a refund's state: status plus who has decided so far. */
function stateSnapshot(refund: RefundState, decisions: readonly DecisionWithApprover[]) {
  const by = (kind: string) => decisions.filter((d) => d.decision === kind).map((d) => d.approver.email);
  return { status: refund.status, requiredApprovals: refund.requiredApprovals, approvedBy: by("approve"), rejectedBy: by("reject") };
}

/** Moves the refund to `status` only if nobody changed it since it was read. */
async function transition(tx: DbClient, refund: { id: string; version: number }, status: string) {
  const { count } = await tx.refund.updateMany({
    where: { id: refund.id, version: refund.version },
    data: { status, version: { increment: 1 } },
  });
  if (count !== 1) throw new ConcurrentChangeError();
}

const requestSchema = z
  .object({
    customerId: z.string().min(1, "Choose a customer").max(64),
    amount: z
      .string()
      .trim()
      .refine((v) => parseAmountToMinor(v) !== null, "Enter an amount between 0.01 and 1,000,000.00 (max 2 decimals)")
      .transform((v) => parseAmountToMinor(v)!),
    currency: z.enum(REFUND_CURRENCIES),
    reason: z.string().trim().min(3, "Give a reason").max(500),
    reasonCode: z.enum(REFUND_REASON_CODES, "Choose a valid reason code").optional(),
    destinationIban: z
      .string()
      .trim()
      .max(64)
      .transform(normalizeIban)
      .refine(isValidIban, "Invalid IBAN"),
  })
  .refine((v) => v.reasonCode || !reasonCodeRequired(v.amount), {
    path: ["reasonCode"],
    message: `Choose a reason code for refunds of ${REASON_CODE_REQUIRED_FROM} or more`,
  });

export async function requestRefund(_prev: RefundActionState, formData: FormData): Promise<RefundActionState> {
  const actor = await authorize(() => requirePermission("refunds:create", { onDenied: "throw" }));
  if (!actor) return { ok: false, message: "You don't have permission to request refunds." };

  const parsed = requestSchema.safeParse({
    customerId: formData.get("customerId") ?? "",
    amount: formData.get("amount") ?? "",
    currency: formData.get("currency"),
    reason: formData.get("reason") ?? "",
    reasonCode: formData.get("reasonCode") || undefined,
    destinationIban: formData.get("destinationIban") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Please fix the errors below.", errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { amount, ...input } = parsed.data;

  const refund = await db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || customer.status !== "active") return null;
    const created = await tx.refund.create({
      data: { ...input, amountMinor: amount, requiredApprovals: requiredApprovalsFor(amount), requestedById: actor.id },
    });
    await recordAudit(
      {
        actor,
        action: "refund.request",
        resource: { type: refundResource.type, id: created.id },
        before: null,
        after: {
          ...stateSnapshot(created, []),
          customerId: created.customerId,
          amountMinor: created.amountMinor,
          currency: created.currency,
          reason: created.reason,
          reasonCode: created.reasonCode,
          destinationIban: created.destinationIban,
        },
      },
      tx,
    );
    return created;
  });

  if (!refund) return { ok: false, message: "Please fix the errors below.", errors: { customerId: ["Unknown or inactive customer"] } };
  revalidatePath("/apps/refunds");
  redirect(`/apps/refunds/${refund.id}`);
}

const decideSchema = z.object({
  id: z.string().min(1).max(64),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

/** Approve or reject a pending refund under the four-eyes rules in ./policy. */
export async function decideRefund(_prev: RefundActionState, formData: FormData): Promise<RefundActionState> {
  const actor = await authorize(() => requirePermission("refunds:approve", { onDenied: "throw" }));
  if (!actor) return { ok: false, message: "You don't have permission to approve or reject refunds." };

  const parsed = decideSchema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { id, decision, note } = parsed.data;
  const resource = { type: refundResource.type, id };

  let result: RefundActionState;
  try {
    result = await db.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({
        where: { id },
        include: { decisions: { include: { approver: { select: { email: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      });
      if (!refund) return { ok: false, message: "Refund not found." };

      const check = checkDecision(refund, refund.decisions, actor.id);
      if (!check.ok) {
        await recordAudit({ actor, action: `refund.${decision}`, outcome: "denied", resource, metadata: { reason: check.reason } }, tx);
        return { ok: false, message: DECISION_BLOCK_MESSAGES[check.reason] };
      }

      const created = await tx.refundDecision.create({
        data: { refundId: id, approverId: actor.id, decision, note },
        include: { approver: { select: { email: true } } },
      });
      const decisions = [...refund.decisions, created];
      const status = statusAfterDecision(decision, decisions, refund.requiredApprovals);
      await transition(tx, refund, status);
      await recordAudit(
        {
          actor,
          action: `refund.${decision}`,
          resource,
          before: stateSnapshot(refund, refund.decisions),
          after: stateSnapshot({ ...refund, status }, decisions),
          ...(note && { metadata: { note } }),
        },
        tx,
      );
      const approvals = decisions.filter((d) => d.decision === "approve").length;
      if (decision === "reject") return { ok: true, message: "Refund rejected." };
      if (status === "approved") return { ok: true, message: "Refund approved." };
      return { ok: true, message: `Approval recorded (${approvals} of ${refund.requiredApprovals}); another approver is needed.` };
    });
  } catch (error) {
    if (error instanceof ConcurrentChangeError) return { ok: false, message: CONFLICT_MESSAGE };
    if (isUniqueViolation(error)) return { ok: false, message: DECISION_BLOCK_MESSAGES.already_decided };
    throw error;
  }

  revalidatePath(`/apps/refunds/${id}`);
  revalidatePath("/apps/refunds");
  return result;
}

const paySchema = z.object({ id: z.string().min(1).max(64) });

/** Records that an approved refund has been paid out. */
export async function markRefundPaid(_prev: RefundActionState, formData: FormData): Promise<RefundActionState> {
  const actor = await authorize(() => requirePermission("refunds:pay", { onDenied: "throw" }));
  if (!actor) return { ok: false, message: "You don't have permission to mark refunds as paid." };

  const parsed = paySchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { id } = parsed.data;

  let result: RefundActionState;
  try {
    result = await db.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id } });
      if (!refund) return { ok: false, message: "Refund not found." };
      if (refund.status !== "approved") return { ok: false, message: "Only approved refunds can be marked as paid." };
      await transition(tx, refund, "paid");
      await recordAudit(
        { actor, action: "refund.pay", resource: { type: refundResource.type, id }, before: { status: refund.status }, after: { status: "paid" } },
        tx,
      );
      return { ok: true, message: "Marked as paid." };
    });
  } catch (error) {
    if (error instanceof ConcurrentChangeError) return { ok: false, message: CONFLICT_MESSAGE };
    throw error;
  }

  revalidatePath(`/apps/refunds/${id}`);
  revalidatePath("/apps/refunds");
  return result;
}
