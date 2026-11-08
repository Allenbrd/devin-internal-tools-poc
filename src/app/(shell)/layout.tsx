import { requirePermission } from "@/platform/permissions";
import { AppShell } from "@/platform/shell";

export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const user = await requirePermission("platform:access");
  return <AppShell user={user}>{children}</AppShell>;
}
