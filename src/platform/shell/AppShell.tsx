import Link from "next/link";
import type { ReactNode } from "react";
import { getAccessibleApps } from "@/platform/apps/access";
import { signOut } from "@/platform/auth/actions";
import type { Principal } from "@/platform/auth";
import { NavLinks } from "./NavLinks";

/** Platform chrome: nav lists only the apps the user may open. */
export function AppShell({ user, children }: { user: Principal; children: ReactNode }) {
  const accessible = getAccessibleApps(user);
  const toItems = (section: "apps" | "admin") =>
    accessible
      .filter((app) => (app.nav ?? "apps") === section)
      .map((app) => ({ href: app.href, name: app.name }));
  const appItems = toItems("apps");
  const adminItems = toItems("admin");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 p-4 text-slate-100">
        <Link href="/" className="mb-6 block text-lg font-semibold">
          Internal Tools
        </Link>
        <nav aria-label="Apps" className="flex-1 space-y-6">
          <div>
            <p className="mb-2 px-3 text-xs uppercase tracking-wide text-slate-500">Apps</p>
            {appItems.length ? <NavLinks items={appItems} /> : <p className="px-3 text-sm text-slate-500">No apps</p>}
          </div>
          {adminItems.length > 0 && (
            <div>
              <p className="mb-2 px-3 text-xs uppercase tracking-wide text-slate-500">Admin</p>
              <NavLinks items={adminItems} />
            </div>
          )}
        </nav>
        <div className="border-t border-slate-800 pt-4 text-sm">
          <p className="font-medium">{user.name}</p>
          <p className="text-slate-400">{user.email}</p>
          <p className="mt-1 inline-block rounded bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
            {user.role}
          </p>
          <form action={signOut} className="mt-3">
            <button type="submit" className="text-slate-300 underline hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 bg-slate-50 p-8">{children}</main>
    </div>
  );
}
