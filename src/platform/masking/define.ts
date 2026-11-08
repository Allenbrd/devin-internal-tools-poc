import type { Permission } from "@/platform/permissions/policy";

export interface SensitiveFieldSpec {
  /** Human label, e.g. "IBAN". */
  label: string;
  /** Produces the display value shown by default (e.g. "****1234"). */
  mask: (value: string) => string;
  /** Permission required to see the plaintext. */
  unmaskPermission: Permission;
}

/**
 * Declares which fields of a record type are sensitive and how to load a
 * record for unmasking. Registered in src/apps/registry.ts.
 */
export interface SensitiveResource<T extends { id: string } = { id: string }, K extends keyof T & string = keyof T & string> {
  /** Resource type, also used as AuditEvent.resourceType. */
  type: string;
  fields: Record<K, SensitiveFieldSpec>;
  load(id: string): Promise<T | null>;
}

/** Type-erased form used by registries. */
export interface AnySensitiveResource {
  type: string;
  fields: Record<string, SensitiveFieldSpec>;
  load(id: string): Promise<{ id: string } | null>;
}

export function defineSensitiveResource<T extends { id: string }, K extends keyof T & string>(
  resource: SensitiveResource<T, K>,
): SensitiveResource<T, K> {
  return resource;
}

/** What reaches the UI instead of a sensitive value. Never contains plaintext. */
export interface MaskedField {
  kind: "masked";
  resource: string;
  recordId: string;
  field: string;
  label: string;
  display: string;
}

export type Masked<T, K extends keyof T> = Omit<T, K> & { [P in K]: MaskedField };

export function maskRecord<T extends { id: string }, K extends keyof T & string>(
  resource: SensitiveResource<T, K>,
  record: T,
): Masked<T, K> {
  const out: Record<string, unknown> = { ...record };
  for (const [field, spec] of Object.entries(resource.fields) as [K, SensitiveFieldSpec][]) {
    const raw = record[field];
    out[field] = {
      kind: "masked",
      resource: resource.type,
      recordId: record.id,
      field,
      label: spec.label,
      display: raw == null ? "" : spec.mask(String(raw)),
    } satisfies MaskedField;
  }
  return out as Masked<T, K>;
}
