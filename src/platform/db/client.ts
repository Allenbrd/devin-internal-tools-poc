import "server-only";
import { PrismaClient } from "@prisma/client";

const AUDIT_BLOCKED_OPERATIONS = new Set([
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

export class AppendOnlyViolationError extends Error {
  constructor(operation: string) {
    super(`AuditEvent is append-only: "${operation}" is not allowed`);
    this.name = "AppendOnlyViolationError";
  }
}

function createClient() {
  return new PrismaClient().$extends({
    name: "audit-append-only",
    query: {
      auditEvent: {
        async $allOperations({ operation, args, query }) {
          if (AUDIT_BLOCKED_OPERATIONS.has(operation)) {
            throw new AppendOnlyViolationError(operation);
          }
          return query(args);
        },
      },
    },
  });
}

export type Db = ReturnType<typeof createClient>;
/** Client usable inside `db.$transaction(async (tx) => ...)`. */
export type DbTransaction = Parameters<Parameters<Db["$transaction"]>[0]>[0];
export type DbClient = Db | DbTransaction;

const globalForDb = globalThis as unknown as { __platformDb?: Db };

export const db: Db = globalForDb.__platformDb ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.__platformDb = db;
