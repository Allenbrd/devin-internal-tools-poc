/**
 * One-command local database setup: `npm run db:setup` (or `db:reset`).
 *
 * 1. Creates .env from .env.example if missing (fresh clone friendly).
 * 2. Syncs the Prisma schema to the database (`prisma db push`).
 * 3. Installs the append-only triggers for AuditEvent.
 * 4. Seeds users and sample data (idempotent).
 *
 * Works for both providers in prisma/schema.prisma (sqlite locally, postgresql in CI).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "prisma", "schema.prisma");
const prismaBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");

function prisma(args: string[]) {
  execFileSync(prismaBin, [...args, "--schema", schemaPath], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
}

export function ensureEnvFile() {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) {
    copyFileSync(path.join(root, ".env.example"), envPath);
    console.log("Created .env from .env.example");
  }
  // Values already set in the environment (e.g. CI) win over .env.
  const before = { ...process.env };
  process.loadEnvFile(envPath);
  Object.assign(process.env, before);
}

export function schemaProvider(): "sqlite" | "postgresql" {
  const match = readFileSync(schemaPath, "utf8").match(/datasource\s+db\s*{[^}]*provider\s*=\s*"(\w+)"/);
  const provider = match?.[1];
  if (provider !== "sqlite" && provider !== "postgresql") {
    throw new Error(`Unsupported datasource provider: ${provider}`);
  }
  return provider;
}

export async function setupDatabase({ reset = false, seed = true } = {}) {
  ensureEnvFile();
  const provider = schemaProvider();

  prisma(["db", "push", ...(reset ? ["--force-reset"] : [])]);
  prisma(["db", "execute", "--file", path.join(root, "prisma", "sql", `audit-append-only.${provider}.sql`)]);

  if (seed) {
    const { seed: runSeed } = await import("../prisma/seed");
    await runSeed();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  setupDatabase({ reset: process.argv.includes("--reset") })
    .then(() => console.log("Database ready."))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
