# Playbook: Add a new internal app

## Overview
Add one app (e.g. Refunds) to the platform using only `@/platform/*` for auth, permissions, audit and
masking. Reference pattern: the README's "Adding a new app" section, the `customers` sample app and the Refunds app
(four-eyes approvals above a threshold).

## What's needed from the requester
- **Users and roles** — who does what, as a permission → roles table over `viewer`, `operator`,
  `approver`, `admin` (e.g. "operators request, approvers approve, viewers can't see the app").
- **Data model** — each record's fields, types, allowed status values and transitions.
- **Sensitive fields** — which fields are masked, the mask, and which permission may reveal them.
- **Approval rules** — four-eyes, self-approval, thresholds (amount, configurable?), N distinct approvers.
- **Seed data and must-have tests** — rough volume, and the scenarios that must be proven.
If any of these is missing, make a reasonable choice and list it in the PR; don't block.

## Procedure
1. `source ~/.nvm/nvm.sh && npm ci && npm run db:setup`; read the README, `src/apps/customers/*`, and
   `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`).
2. **Manifest** — `src/apps/<app>/manifest.ts` with `defineApp({ id, name, description, href,
   accessPermission, permissions })`. Permissions are `<app>:<verb>`; grant each only to the roles asked for.
3. **Register** in `src/apps/registry.ts`: add to `apps`, and to `sensitiveResources` if step 5 applies.
4. **Models** in `prisma/schema.prisma`: Postgres-portable (no enums — status is a `String` validated by a
   `const` array; JSON as `String`; money as integer minor units or `Decimal`). Run `npm run db:setup`.
5. **Sensitive fields** — `src/apps/<app>/sensitive.ts` with `defineSensitiveResource({ type, fields:
   { <field>: { label, mask, unmaskPermission } }, load })`.
6. **Data access** — `src/apps/<app>/data.ts` (`import "server-only"`); read records via
   `readMasked` / `readMaskedList`, never hand raw rows with sensitive fields to a client component.
7. **Mutations** — server actions in `src/apps/<app>/actions.ts` (`"use server"`). Each one:
   `requirePermission(..., { onDenied: "throw" })` first → zod-validate input → in one `db.$transaction`
   load `before`, enforce business rules (approval rules live here, server-side, not in the UI),
   write, `recordAudit({ actor, action: "<resource>.<verb>", resource, before, after }, tx)`.
8. **Pages** under `src/app/(shell)/apps/<app>/` (and any `src/app/api/apps/<app>/` routes): first line
   `await requirePermission("<app>:read")`. Use `PageHeader`, `<SensitiveValue>`, `canUnmask()`.
   If asked for a per-record audit trail, use `listAuditEvents({ resourceType, resourceId })`
   from `@/platform/audit`.
9. **Seed** in `prisma/seed.ts` covering every status and edge (e.g. amounts either side of a threshold).
10. **Tests** in `tests/<app>.test.ts` using `signInAs`, `form`, `lastAuditEvent` from `tests/support/helpers`:
    each requested scenario, each approval rule (including the denial path), a role that must not see the
    app, and a "no plaintext sensitive value anywhere in `AuditEvent`" check like `tests/masking.test.ts`.
11. Run `npm run lint && npm run typecheck && npm test && npm run build`, then the Postgres run from
    the README/CI. Open the PR and wait for CI.

## Rules that can't be broken
- **Deny by default.** Every page, layout, route handler and `"use server"` export calls
  `requirePermission()`. Never add to `PUBLIC_ENTRY_POINTS` in `tests/guard-coverage.test.ts`, never
  grant a permission to a role nobody asked for, never gate access in the UI only.
- **Audit every write.** Every mutation calls `recordAudit()` with `before`/`after` in the same
  transaction. Never write to `AuditEvent` directly, never update or delete audit rows.
- **Never store unmasked sensitive values** outside their own column: not in audit payloads/metadata,
  logs, error messages, URLs or client props. Declare them sensitive; reveal only via `<SensitiveValue>`.
- **No custom auth.** Use `getCurrentUser()` / `requirePermission()` only. No new providers, cookies,
  sessions, role checks on `user.role`, or edits to `src/platform/**` to make an app work — if the
  platform is missing something, stop and raise it in the PR.

## Definition of done
- CI green: lint, typecheck, build, and tests on SQLite and Postgres (Node 22 and 24).
- `tests/guard-coverage.test.ts` passes with no new allowlist entries.
- App tests cover every requested scenario and approval rule.
- PR description lists every choice made that the requester didn't specify (thresholds, status
  transitions, role grants, field types, masks), plus how to try it with the seeded users.
