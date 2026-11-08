"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/platform/audit";
import { getAuthProvider, getCurrentUser } from "@/platform/auth";

export async function signOut() {
  const user = await getCurrentUser();
  const provider = getAuthProvider();
  if (user) await recordAudit({ actor: user, action: "auth.sign_out" });
  await provider.signOut();
  redirect(provider.signInPath);
}
