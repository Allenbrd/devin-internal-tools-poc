"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/platform/audit";
import { safeRedirectPath } from "@/platform/validation/redirect";
import { mockAuthProvider } from "./provider";

const signInSchema = z.object({
  userId: z.string().min(1).max(64),
  next: z.string().max(512).optional(),
});

export async function signInAsMockUser(formData: FormData) {
  const parsed = signInSchema.safeParse({
    userId: formData.get("userId"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) redirect("/sign-in?error=invalid");

  const user = await mockAuthProvider.signInAs(parsed.data.userId);
  if (!user) redirect("/sign-in?error=unknown_user");

  await recordAudit({ actor: user, action: "auth.sign_in", metadata: { provider: mockAuthProvider.id } });
  redirect(safeRedirectPath(parsed.data.next));
}
