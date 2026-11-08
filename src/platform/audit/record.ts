import "server-only";
import { db, type DbClient } from "@/platform/db";
import type { Principal } from "@/platform/auth/types";
import { redactForAudit } from "./redact";

export type AuditOutcome = "success" | "denied";

export interface AuditEventInput {
  actor: Pick<Principal, "id" | "email" | "role">;
  /** Dotted verb: "<resource>.<verb>", e.g. "customer.update", "sensitive.unmask". */
  action: string;
  outcome?: AuditOutcome;
  resource?: { type: string; id?: string | null };
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

/**
 * Append an audit event. The only write path to AuditEvent. Sensitive values
 * are masked before they are stored. Pass `tx` to make the audit entry atomic
 * with the change it describes.
 */
export async function recordAudit(input: AuditEventInput, tx: DbClient = db): Promise<void> {
  const resourceType = input.resource?.type ?? null;
  await tx.auditEvent.create({
    data: {
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      action: input.action,
      outcome: input.outcome ?? "success",
      resourceType,
      resourceId: input.resource?.id ?? null,
      before: toJson(redactForAudit(resourceType, input.before)),
      after: toJson(redactForAudit(resourceType, input.after)),
      metadata: toJson(redactForAudit(resourceType, input.metadata)),
    },
  });
}
