import "server-only";
import { db } from "@/platform/db";

export interface AuditFilters {
  actorEmail?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: string;
}

export const AUDIT_PAGE_SIZE = 50;

/** Read-only access to the audit log, newest first. */
export async function listAuditEvents(filters: AuditFilters, page = 1) {
  const where = {
    ...(filters.actorEmail && { actorEmail: { contains: filters.actorEmail } }),
    ...(filters.action && { action: { startsWith: filters.action } }),
    ...(filters.resourceType && { resourceType: filters.resourceType }),
    ...(filters.resourceId && { resourceId: filters.resourceId }),
    ...(filters.outcome && { outcome: filters.outcome }),
  };
  const [events, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (Math.max(1, page) - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    db.auditEvent.count({ where }),
  ]);
  return { events, total, page, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}
