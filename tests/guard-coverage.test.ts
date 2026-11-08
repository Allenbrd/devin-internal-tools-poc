/**
 * Static check that every server entry point calls requirePermission():
 * pages, layouts and route handlers under src/app, and every exported
 * function in a "use server" module. New exceptions must be added to
 * PUBLIC_ENTRY_POINTS with a reason.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

const PUBLIC_ENTRY_POINTS: Record<string, string> = {
  "src/app/layout.tsx": "Root HTML layout, renders no data",
  "src/app/sign-in/page.tsx": "Sign-in page must be reachable signed out",
  "src/app/forbidden/page.tsx": "Static access-denied page",
  "src/platform/auth/mock/actions.ts": "Mock sign-in creates the session",
  "src/platform/auth/actions.ts": "Sign-out only ends the caller's own session",
};

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function callsRequirePermission(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "requirePermission") {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

const isExported = (node: ts.Node) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const isDefault = (node: ts.Node) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

type Kind = "page" | "route" | "server-action";

/** Returns the names of entry points in `source` that do not call requirePermission(). */
export function findUnguarded(fileName: string, source: string, kind: Kind): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const functions = new Map<string, ts.Node>();
  const entries: { name: string; node: ts.Node | undefined }[] = [];

  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) functions.set(stmt.name.text, stmt);
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) functions.set(d.name.text, d.initializer);
      }
    }
  }

  for (const stmt of sf.statements) {
    if (kind === "page") {
      if (ts.isFunctionDeclaration(stmt) && isExported(stmt) && isDefault(stmt)) entries.push({ name: "default", node: stmt });
      if (ts.isExportAssignment(stmt)) {
        const target = ts.isIdentifier(stmt.expression) ? functions.get(stmt.expression.text) : stmt.expression;
        entries.push({ name: "default", node: target });
      }
      continue;
    }
    const wanted = (name: string) => (kind === "route" ? HTTP_METHODS.has(name) : true);
    if (ts.isFunctionDeclaration(stmt) && isExported(stmt) && stmt.name && wanted(stmt.name.text)) {
      entries.push({ name: stmt.name.text, node: stmt });
    }
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && wanted(d.name.text) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          entries.push({ name: d.name.text, node: d.initializer });
        }
      }
    }
  }
  return entries.filter((e) => !e.node || !callsRequirePermission(e.node)).map((e) => e.name);
}

function classify(rel: string, source: string): Kind | null {
  if (/^src\/app\/(.*\/)?(page|layout)\.tsx?$/.test(rel)) return "page";
  if (/^src\/app\/(.*\/)?route\.ts$/.test(rel)) return "route";
  if (/^\s*["']use server["']/.test(source)) return "server-action";
  return null;
}

describe("requirePermission coverage", () => {
  const files = walk(path.join(ROOT, "src")).map((full) => {
    const rel = path.relative(ROOT, full).split(path.sep).join("/");
    const source = readFileSync(full, "utf8");
    return { rel, source, kind: classify(rel, source) };
  });
  const entryFiles = files.filter((f) => f.kind !== null);

  it("finds the entry points (sanity check)", () => {
    const kinds = new Set(entryFiles.map((f) => f.kind));
    expect(kinds).toEqual(new Set(["page", "route", "server-action"]));
  });

  it("every page, layout, route handler and server action calls requirePermission()", () => {
    const violations = entryFiles
      .filter((f) => !(f.rel in PUBLIC_ENTRY_POINTS))
      .flatMap((f) => findUnguarded(f.rel, f.source, f.kind!).map((name) => `${f.rel}#${name}`));
    expect(violations).toEqual([]);
  });

  it("public allowlist has no stale entries", () => {
    for (const rel of Object.keys(PUBLIC_ENTRY_POINTS)) {
      expect(entryFiles.map((f) => f.rel)).toContain(rel);
    }
  });

  it("detects unguarded entry points", () => {
    expect(findUnguarded("a.ts", `"use server"; export async function leak() { return 1 }`, "server-action")).toEqual(["leak"]);
    expect(findUnguarded("a.ts", `export const GET = async () => Response.json({})`, "route")).toEqual(["GET"]);
    expect(findUnguarded("p.tsx", `export default async function P() { return null }`, "page")).toEqual(["default"]);
    expect(
      findUnguarded("p.tsx", `async function P() { await requirePermission("x:y"); return null } export default P`, "page"),
    ).toEqual([]);
  });
});
