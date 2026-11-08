import { listCustomers } from "@/apps/customers/data";
import { authErrorResponse, requirePermission } from "@/platform/permissions";

/** Example route handler: same gate, JSON 401/403 instead of redirects. */
export async function GET() {
  try {
    const user = await requirePermission("customers:read", { onDenied: "throw" });
    return Response.json({ customers: await listCustomers(user) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
