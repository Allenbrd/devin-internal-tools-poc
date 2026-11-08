import Link from "next/link";
import { getAccessibleApps } from "@/platform/apps/access";
import { requirePermission } from "@/platform/permissions";
import { PageHeader } from "@/platform/shell";

export default async function HomePage() {
  const user = await requirePermission("platform:access");
  const apps = getAccessibleApps(user);

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Apps available to your role." />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <li key={app.id}>
            <Link href={app.href} className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400">
              <p className="font-medium text-slate-900">{app.name}</p>
              <p className="mt-1 text-sm text-slate-600">{app.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
