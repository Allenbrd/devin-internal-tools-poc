import "server-only";
import type { Principal } from "@/platform/auth";
import { db } from "@/platform/db";
import { readMasked, readMaskedList } from "@/platform/masking/server";
import { customerResource } from "./sensitive";

export const CUSTOMER_STATUSES = ["active", "suspended", "closed"] as const;

/** All customers with sensitive fields masked; audited as a sensitive read. */
export async function listCustomers(actor: Principal) {
  const customers = await db.customer.findMany({ orderBy: { name: "asc" } });
  return readMaskedList(actor, customerResource, customers);
}

export async function getCustomer(actor: Principal, id: string) {
  const customer = await db.customer.findUnique({ where: { id } });
  return customer ? readMasked(actor, customerResource, customer) : null;
}
