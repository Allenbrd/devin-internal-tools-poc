# Internal Tools Platform

A host for small internal apps (refunds dashboard, feature-flag admin, KYC review, ...) built on a
shared platform layer: auth, permissions, audit, field masking and the app shell.

**Stack:** Next.js 16 (App Router, TypeScript) · Prisma (SQLite locally, Postgres-compatible schema) · Tailwind 4 · Vitest

## Quick start

```bash
npm install && npm run db:setup && npm run dev
```

Open http://localhost:3000 and pick a seeded user:

| User | Role | Customer Directory | Audit log |
| --- | --- | --- | --- |
| Vera Viewer | viewer | read (masked) | – |
| Oscar Operator | operator | read + edit | – |
| April Approver | approver | read + reveal IBAN | – |
| Adam Admin | admin | everything | browse |

Node `^20.19.0 || >=22.12.0` is required (Vite 7 / Vitest; `.nvmrc` pins 24, CI also tests 22). `db:setup` creates `.env` from `.env.example` if missing,
syncs the schema, installs the append-only audit triggers and seeds data. `npm run db:reset` wipes and re-seeds.

| Script | |
| --- | --- |
| `npm run lint` / `typecheck` / `test` / `build` | what CI runs |
| `npm run db:studio` | browse the local DB |

## Structure

```
src/
  platform/            shared layer — apps only import from here
    auth/              AuthProvider interface, provider registry, mock SSO, signed session cookie
    permissions/       requirePermission(), policy built from app manifests (deny by default)
    audit/             recordAudit() (only write path), redaction, read-only query
    masking/           defineSensitiveResource(), masks, readMasked(), reveal action + <SensitiveValue>
    apps/              defineApp() manifest type, platform-owned apps (audit log)
    shell/             AppShell (nav filtered by permission), PageHeader
    db/                Prisma client with append-only guard on AuditEvent
  apps/
    registry.ts        THE place apps are registered
    customers/         sample app: manifest, sensitive fields, data access, server actions, components
  app/                 Next routes
    (shell)/           everything behind sign-in, wrapped in the AppShell
    sign-in/ forbidden/ public pages
    api/apps/...       route handlers
  proxy.ts             coarse "has a session cookie" redirect; real checks happen server-side
prisma/                schema, seed, append-only SQL triggers (sqlite + postgresql)
tests/                 Vitest suites (run against SQLite locally, SQLite + Postgres in CI)
```

### Auth (replaceable with Entra ID)

Apps never see the provider. They only call `getCurrentUser()` / `requirePermission()` from
`@/platform/auth` and `@/platform/permissions`, and receive a provider-agnostic `Principal`
(`id`, `externalId`, `email`, `name`, `role`). The provider is chosen by `AUTH_PROVIDER`
(`src/platform/auth/provider.ts`). To add Entra ID, implement `AuthProvider` (`getCurrentUser`,
`signOut`, `signInPath`) — e.g. map the Entra `oid` to `User.externalId` and app-role claims to `Role` —
and register it. No app code changes.

Mock SSO refuses to run with `NODE_ENV=production` unless `ALLOW_MOCK_AUTH=true`.

### Permissions

- Each app manifest declares its permissions and which roles get them. The policy is the union of all
  manifests; anything not declared is denied, as are unknown roles, missing/invalid/expired sessions and
  deactivated users.
- `requirePermission(permission)` is called at the top of **every** page, layout, route handler and
  server action. Pages redirect (sign-in / `/forbidden`); actions and routes use `{ onDenied: "throw" }`.
  Denials are audited (`access.denied`).
- `tests/guard-coverage.test.ts` statically fails CI if any page/layout/route/`"use server"` export
  doesn't call `requirePermission()` (public pages are an explicit, reasoned allowlist).

### Audit log

- `AuditEvent` is append-only: no update/delete code path, a Prisma client extension that rejects
  update/upsert/delete on the model, and DB triggers (SQLite and Postgres) that reject UPDATE/DELETE
  (and TRUNCATE on Postgres).
- Each event records who (actor id/email/name/role, denormalised), what (action, resource type/id,
  outcome), when, `before`, `after` and metadata.
- `recordAudit()` redacts every payload: declared sensitive fields are masked, and an IBAN/card
  pattern scrubber is a safety net for anything else. Plaintext sensitive values are never stored.
- Admins browse it at `/admin/audit` (filters + pagination). Browsing the log is itself audited.

### Field masking

```ts
// src/apps/customers/sensitive.ts
export const customerResource = defineSensitiveResource({
  type: "customer",
  fields: { iban: { label: "IBAN", mask: masks.iban, unmaskPermission: "customers:unmask_iban" } },
  load: (id) => db.customer.findUnique({ where: { id } }),
});
```

- `readMasked()` / `readMaskedList()` return records with sensitive fields replaced by
  `{ masked: "****1234" }`, so plaintext never reaches a client component by default. Reading a record
  with sensitive fields writes a `sensitive.read` event (masked value only).
- `<SensitiveValue>` shows the masked value and, if the user may unmask, a Reveal button that calls the
  `revealSensitiveField` server action: it checks the field's `unmaskPermission`, loads the plaintext,
  writes `sensitive.unmask` (without the value), and returns it. The UI re-masks after 30 s.

## Adding a new app

1. **Manifest** — `src/apps/<app>/manifest.ts`:
   ```ts
   export const refundsApp = defineApp({
     id: "refunds",
     name: "Refunds",
     description: "Review and approve refunds",
     href: "/apps/refunds",
     accessPermission: "refunds:read",
     permissions: {
       "refunds:read": ["viewer", "operator", "approver", "admin"],
       "refunds:create": ["operator", "admin"],
       "refunds:approve": ["approver", "admin"],
     },
   });
   ```
2. **Register** it in `src/apps/registry.ts` (`apps`, and `sensitiveResources` if it has sensitive fields).
   The nav entry and permission names (typed) appear automatically.
3. **Models** — add tables to `prisma/schema.prisma` (keep it Postgres-portable: no enums, JSON as
   `String`) and run `npm run db:setup`.
4. **Pages** under `src/app/(shell)/apps/<app>/` — start each with
   `await requirePermission("refunds:read")`.
5. **Mutations** as server actions in `src/apps/<app>/actions.ts` — start with
   `requirePermission(..., { onDenied: "throw" })`, write the change and `recordAudit({ before, after })`
   in one transaction.
6. **Sensitive fields** — declare them with `defineSensitiveResource`, read through `readMasked`, render
   with `<SensitiveValue>`.

CI (lint, types, guard coverage, tests on SQLite and Postgres) will tell you if a step was missed.
