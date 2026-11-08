import { scrubSensitivePatterns } from "@/platform/masking/masks";
import { getSensitiveResource } from "@/platform/masking/registry";

/**
 * Makes a value safe to persist in the audit log: fields declared sensitive
 * for `resourceType` are masked with their own mask, and every remaining
 * string is scrubbed for IBAN / card-number patterns.
 */
export function redactForAudit(resourceType: string | null | undefined, value: unknown): unknown {
  const fields = getSensitiveResource(resourceType)?.fields;

  const walk = (v: unknown, key?: string): unknown => {
    if (v == null) return v;
    if (key && fields?.[key]) return fields[key].mask(String(v));
    if (typeof v === "string") return scrubSensitivePatterns(v);
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map((item) => walk(item));
    if (typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, item]) => [k, walk(item, k)]));
    }
    return v;
  };

  return walk(value);
}
