"use server";

import { z } from "zod";
import { recordAudit } from "@/platform/audit";
import { ForbiddenError, UnauthenticatedError, requirePermission } from "@/platform/permissions";
import { getSensitiveResource } from "./registry";

const revealSchema = z.object({
  resource: z.string().min(1).max(64),
  recordId: z.string().min(1).max(64),
  field: z.string().min(1).max(64),
});

export type RevealResult =
  | { ok: true; value: string }
  | { ok: false; error: "invalid" | "not_found" | "unauthenticated" | "forbidden" };

/**
 * Returns the plaintext of one sensitive field. Requires the field's unmask
 * permission and writes a `sensitive.unmask` audit event (without the value).
 */
export async function revealSensitiveField(input: z.input<typeof revealSchema>): Promise<RevealResult> {
  const parsed = revealSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { resource: type, recordId, field } = parsed.data;

  const resource = getSensitiveResource(type);
  const spec = resource && Object.hasOwn(resource.fields, field)
    ? resource.fields[field]
    : undefined;
  if (!resource || !spec) return { ok: false, error: "not_found" };

  let user;
  try {
    user = await requirePermission(spec.unmaskPermission, { onDenied: "throw" });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return { ok: false, error: "unauthenticated" };
    if (error instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    throw error;
  }

  const record = (await resource.load(recordId)) as Record<string, unknown> | null;
  const value = record?.[field];
  if (value == null) return { ok: false, error: "not_found" };

  await recordAudit({
    actor: user,
    action: "sensitive.unmask",
    resource: { type, id: recordId },
    metadata: { field },
  });
  return { ok: true, value: String(value) };
}
