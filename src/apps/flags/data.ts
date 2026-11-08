import "server-only";
import { listAuditEvents } from "@/platform/audit";
import { db } from "@/platform/db";

export const FLAG_ENVIRONMENTS = ["dev", "staging", "prod"] as const;
export type FlagEnvironment = (typeof FLAG_ENVIRONMENTS)[number];

/** Environments where a toggle must be requested and approved by someone else. */
export const APPROVAL_REQUIRED_ENVIRONMENTS: readonly string[] = ["prod"] satisfies FlagEnvironment[];

export const REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;

export const FLAG_RESOURCE_TYPE = "feature_flag";

export function requiresApproval(environment: string) {
  return APPROVAL_REQUIRED_ENVIRONMENTS.includes(environment);
}

export function isFlagEnvironment(value: unknown): value is FlagEnvironment {
  return typeof value === "string" && (FLAG_ENVIRONMENTS as readonly string[]).includes(value);
}

const ENV_ORDER = Object.fromEntries(FLAG_ENVIRONMENTS.map((env, i) => [env, i]));

/** Flags sorted by key, then dev → staging → prod, with their pending request (if any). */
export async function listFlags(filter: { environment?: FlagEnvironment } = {}) {
  const flags = await db.featureFlag.findMany({
    where: filter.environment ? { environment: filter.environment } : {},
    include: { changeRequests: { where: { status: "pending" }, take: 1 } },
    orderBy: { key: "asc" },
  });
  return flags
    .map(({ changeRequests, ...flag }) => ({ ...flag, pendingRequest: changeRequests[0] ?? null }))
    .sort((a, b) => a.key.localeCompare(b.key) || (ENV_ORDER[a.environment] ?? 99) - (ENV_ORDER[b.environment] ?? 99));
}

export async function getFlag(id: string) {
  return db.featureFlag.findUnique({
    where: { id },
    include: { changeRequests: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 } },
  });
}

export async function listPendingRequests() {
  return db.flagChangeRequest.findMany({
    where: { status: "pending" },
    include: { flag: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/** The flag's toggles, requests and decisions (including refused attempts), newest first. */
export async function getFlagHistory(flagId: string) {
  const { events } = await listAuditEvents({ resourceType: FLAG_RESOURCE_TYPE, resourceId: flagId, action: "flag." });
  return events;
}
