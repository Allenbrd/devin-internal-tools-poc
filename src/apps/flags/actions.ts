"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/platform/audit";
import type { Principal } from "@/platform/auth";
import { db } from "@/platform/db";
import { ForbiddenError, UnauthenticatedError, requirePermission } from "@/platform/permissions";
import { FLAG_RESOURCE_TYPE, requiresApproval } from "./data";

export type FlagActionState = { ok: boolean; message?: string; errors?: Record<string, string[]> };

const id = z.string().min(1).max(64);
const enabled = z.enum(["true", "false"]).transform((v) => v === "true");

const toggleSchema = z.object({ id, enabled });
const requestSchema = z.object({
  id,
  enabled,
  reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500),
});
const decisionSchema = z.object({ requestId: id });

const NO_PERMISSION: FlagActionState = { ok: false, message: "You don't have permission to do that." };

/** Maps auth failures to null so actions can return a message; rethrows anything else. */
function deniedToNull(error: unknown): null {
  if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) return null;
  throw error;
}

function invalid(error: z.ZodError): FlagActionState {
  return { ok: false, message: "Please fix the errors below.", errors: z.flattenError(error).fieldErrors };
}

/** A business-rule refusal: audited as denied, nothing changes. */
async function refuse(
  actor: Principal,
  action: string,
  flagId: string,
  reason: string,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<FlagActionState> {
  await recordAudit({
    actor,
    action,
    outcome: "denied",
    resource: { type: FLAG_RESOURCE_TYPE, id: flagId },
    metadata: { reason, ...metadata },
  });
  return { ok: false, message };
}

function revalidateFlag(flagId: string) {
  revalidatePath("/apps/flags");
  revalidatePath(`/apps/flags/${flagId}`);
}

const flagContext = (flag: { key: string; environment: string }) => ({ key: flag.key, environment: flag.environment });

/** Directly toggle a flag in an environment that doesn't need approval (dev, staging). */
export async function toggleFlag(_prev: FlagActionState, formData: FormData): Promise<FlagActionState> {
  const actor = await requirePermission("flags:toggle", { onDenied: "throw" }).catch(deniedToNull);
  if (!actor) return NO_PERMISSION;

  const parsed = toggleSchema.safeParse({ id: formData.get("id"), enabled: formData.get("enabled") });
  if (!parsed.success) return invalid(parsed.error);
  const { id: flagId, enabled: target } = parsed.data;

  const flag = await db.featureFlag.findUnique({ where: { id: flagId } });
  if (!flag) return { ok: false, message: "Flag not found." };
  if (requiresApproval(flag.environment)) {
    return refuse(
      actor,
      "flag.toggle",
      flag.id,
      "approval_required",
      `${flag.environment} flags need an approver: request the change instead.`,
      { ...flagContext(flag), requestedEnabled: target },
    );
  }

  const result = await db.$transaction(async (tx) => {
    const before = await tx.featureFlag.findUnique({ where: { id: flagId } });
    if (!before) return "not_found" as const;
    if (before.enabled === target) return "unchanged" as const;
    // Conditional write: a concurrent toggle makes this a no-op instead of a lost update.
    const { count } = await tx.featureFlag.updateMany({
      where: { id: flagId, enabled: before.enabled },
      data: { enabled: target },
    });
    if (count !== 1) return "unchanged" as const;
    await recordAudit(
      {
        actor,
        action: "flag.toggle",
        resource: { type: FLAG_RESOURCE_TYPE, id: flagId },
        before: { enabled: before.enabled },
        after: { enabled: target },
        metadata: flagContext(before),
      },
      tx,
    );
    return "ok" as const;
  });

  if (result === "not_found") return { ok: false, message: "Flag not found." };
  if (result === "unchanged") return { ok: false, message: `Flag is already ${target ? "on" : "off"}.` };
  revalidateFlag(flagId);
  return { ok: true, message: `Turned ${target ? "on" : "off"}.` };
}

/** Ask for a prod toggle; it is applied only when an approver (not the requester) approves it. */
export async function requestProdToggle(_prev: FlagActionState, formData: FormData): Promise<FlagActionState> {
  const actor = await requirePermission("flags:toggle", { onDenied: "throw" }).catch(deniedToNull);
  if (!actor) return NO_PERMISSION;

  const parsed = requestSchema.safeParse({
    id: formData.get("id"),
    enabled: formData.get("enabled"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const { id: flagId, enabled: target, reason } = parsed.data;

  const result = await db.$transaction(async (tx) => {
    const flag = await tx.featureFlag.findUnique({ where: { id: flagId } });
    if (!flag) return { error: "Flag not found." };
    if (!requiresApproval(flag.environment)) {
      return { error: `${flag.environment} flags don't need approval: toggle them directly.` };
    }
    if (flag.enabled === target) return { error: `Flag is already ${target ? "on" : "off"}.` };
    const pending = await tx.flagChangeRequest.findUnique({ where: { pendingFlagId: flagId } });
    if (pending) return { error: "This flag already has a pending request." };

    const request = await tx.flagChangeRequest.create({
      data: {
        flagId,
        enabled: target,
        reason,
        status: "pending",
        pendingFlagId: flagId,
        requestedById: actor.id,
        requestedByEmail: actor.email,
      },
    });
    await recordAudit(
      {
        actor,
        action: "flag.toggle_request",
        resource: { type: FLAG_RESOURCE_TYPE, id: flagId },
        before: { enabled: flag.enabled },
        after: { requestedEnabled: target, status: "pending" },
        metadata: { ...flagContext(flag), requestId: request.id, reason },
      },
      tx,
    );
    return { error: null };
  });

  if (result.error) return { ok: false, message: result.error };
  revalidateFlag(flagId);
  return { ok: true, message: "Requested. An approver needs to approve it." };
}

/** Approve a pending prod toggle and apply it. Requesters can't approve their own request. */
export async function approveProdToggle(_prev: FlagActionState, formData: FormData): Promise<FlagActionState> {
  const actor = await requirePermission("flags:approve", { onDenied: "throw" }).catch(deniedToNull);
  if (!actor) return NO_PERMISSION;

  const parsed = decisionSchema.safeParse({ requestId: formData.get("requestId") });
  if (!parsed.success) return invalid(parsed.error);
  const { requestId } = parsed.data;

  const request = await db.flagChangeRequest.findUnique({ where: { id: requestId }, include: { flag: true } });
  if (!request) return { ok: false, message: "Request not found." };
  if (request.requestedById === actor.id) {
    return refuse(actor, "flag.toggle_approve", request.flagId, "self_approval", "You can't approve your own request.", {
      ...flagContext(request.flag),
      requestId,
    });
  }

  const result = await db.$transaction(async (tx) => {
    const decided = await tx.flagChangeRequest.updateMany({
      where: { id: requestId, status: "pending", requestedById: { not: actor.id } },
      data: { status: "approved", pendingFlagId: null, decidedById: actor.id, decidedByEmail: actor.email, decidedAt: new Date() },
    });
    if (decided.count !== 1) return "not_pending" as const;
    const before = await tx.featureFlag.findUniqueOrThrow({ where: { id: request.flagId } });
    const after = await tx.featureFlag.update({ where: { id: request.flagId }, data: { enabled: request.enabled } });
    await recordAudit(
      {
        actor,
        action: "flag.toggle_approve",
        resource: { type: FLAG_RESOURCE_TYPE, id: request.flagId },
        before: { enabled: before.enabled },
        after: { enabled: after.enabled },
        metadata: { ...flagContext(before), requestId, requestedBy: request.requestedByEmail, reason: request.reason },
      },
      tx,
    );
    return "ok" as const;
  });

  if (result === "not_pending") return { ok: false, message: "This request is no longer pending." };
  revalidateFlag(request.flagId);
  return { ok: true, message: `Approved: flag turned ${request.enabled ? "on" : "off"}.` };
}

/** Reject a pending prod toggle; the flag is unchanged. */
export async function rejectProdToggle(_prev: FlagActionState, formData: FormData): Promise<FlagActionState> {
  const actor = await requirePermission("flags:approve", { onDenied: "throw" }).catch(deniedToNull);
  if (!actor) return NO_PERMISSION;

  const parsed = decisionSchema.safeParse({ requestId: formData.get("requestId") });
  if (!parsed.success) return invalid(parsed.error);
  const { requestId } = parsed.data;

  const result = await db.$transaction(async (tx) => {
    const request = await tx.flagChangeRequest.findUnique({ where: { id: requestId }, include: { flag: true } });
    if (!request) return null;
    const decided = await tx.flagChangeRequest.updateMany({
      where: { id: requestId, status: "pending" },
      data: { status: "rejected", pendingFlagId: null, decidedById: actor.id, decidedByEmail: actor.email, decidedAt: new Date() },
    });
    if (decided.count !== 1) return { flagId: request.flagId, pending: false };
    await recordAudit(
      {
        actor,
        action: "flag.toggle_reject",
        resource: { type: FLAG_RESOURCE_TYPE, id: request.flagId },
        before: { status: "pending" },
        after: { status: "rejected" },
        metadata: { ...flagContext(request.flag), requestId, requestedBy: request.requestedByEmail, requestedEnabled: request.enabled },
      },
      tx,
    );
    return { flagId: request.flagId, pending: true };
  });

  if (!result) return { ok: false, message: "Request not found." };
  if (!result.pending) return { ok: false, message: "This request is no longer pending." };
  revalidateFlag(result.flagId);
  return { ok: true, message: "Rejected. The flag is unchanged." };
}
