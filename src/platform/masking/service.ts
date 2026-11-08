import "server-only";
import { recordAudit } from "@/platform/audit";
import type { Principal } from "@/platform/auth/types";
import { hasPermission } from "@/platform/permissions/policy";
import { maskRecord, type Masked, type SensitiveFieldSpec, type SensitiveResource } from "./define";

/** Mask a record for display and audit that its sensitive fields were read (masked). */
export async function readMasked<T extends { id: string }, K extends keyof T & string>(
  actor: Principal,
  resource: SensitiveResource<T, K>,
  record: T,
): Promise<Masked<T, K>> {
  await recordAudit({
    actor,
    action: "sensitive.read",
    resource: { type: resource.type, id: record.id },
    metadata: { fields: Object.keys(resource.fields), masked: true },
  });
  return maskRecord(resource, record);
}

/** List variant of readMasked: one audit event listing the record ids. */
export async function readMaskedList<T extends { id: string }, K extends keyof T & string>(
  actor: Principal,
  resource: SensitiveResource<T, K>,
  records: T[],
): Promise<Masked<T, K>[]> {
  await recordAudit({
    actor,
    action: "sensitive.read",
    resource: { type: resource.type },
    metadata: { fields: Object.keys(resource.fields), masked: true, recordIds: records.map((r) => r.id) },
  });
  return records.map((record) => maskRecord(resource, record));
}

/** UI hint only (e.g. show a Reveal button); the server re-checks on reveal. */
export function canUnmask<T extends { id: string }, K extends keyof T & string>(
  user: Principal | null,
  resource: SensitiveResource<T, K>,
  field: K,
): boolean {
  const spec = (resource.fields as Record<string, SensitiveFieldSpec>)[field];
  return !!spec && hasPermission(user, spec.unmaskPermission);
}
