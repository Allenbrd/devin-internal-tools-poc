"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/platform/audit";
import { db } from "@/platform/db";
import { ForbiddenError, UnauthenticatedError, requirePermission } from "@/platform/permissions";
import { isValidIban, normalizeIban } from "@/platform/validation/iban";
import { CUSTOMER_STATUSES } from "./data";
import { customerResource } from "./sensitive";

const updateSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1, "Name is required").max(200),
  status: z.enum(CUSTOMER_STATUSES),
  // Empty means "keep the current IBAN"; the form never receives the plaintext.
  iban: z
    .string()
    .trim()
    .max(64)
    .transform((v) => (v ? normalizeIban(v) : undefined))
    .refine((v) => v === undefined || isValidIban(v), "Invalid IBAN"),
});

export type UpdateCustomerState = { ok: boolean; message?: string; errors?: Record<string, string[]> };

export async function updateCustomer(_prev: UpdateCustomerState, formData: FormData): Promise<UpdateCustomerState> {
  let actor;
  try {
    actor = await requirePermission("customers:update", { onDenied: "throw" });
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
      return { ok: false, message: "You don't have permission to edit customers." };
    }
    throw error;
  }

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    status: formData.get("status"),
    iban: formData.get("iban") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Please fix the errors below.", errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { id, ...changes } = parsed.data;

  const updated = await db.$transaction(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) return null;
    const after = await tx.customer.update({
      where: { id },
      data: { name: changes.name, status: changes.status, ...(changes.iban && { iban: changes.iban }) },
    });
    const pick = (c: typeof before) => ({ name: c.name, status: c.status, iban: c.iban });
    await recordAudit(
      {
        actor,
        action: "customer.update",
        resource: { type: customerResource.type, id },
        before: pick(before),
        after: pick(after),
      },
      tx,
    );
    return after;
  });

  if (!updated) return { ok: false, message: "Customer not found." };
  revalidatePath(`/apps/customers/${id}`);
  revalidatePath("/apps/customers");
  return { ok: true, message: "Saved." };
}
