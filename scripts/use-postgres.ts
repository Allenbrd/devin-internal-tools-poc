/**
 * CI helper: switches prisma/schema.prisma to the postgresql provider so the
 * exact same schema and test suite run against Postgres. Not for local use.
 */
import { readFileSync, writeFileSync } from "node:fs";

const file = "prisma/schema.prisma";
const schema = readFileSync(file, "utf8");
const next = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
if (next === schema) throw new Error("sqlite provider not found in schema");
writeFileSync(file, next);
console.log("prisma/schema.prisma now targets postgresql");
