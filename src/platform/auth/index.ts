import "server-only";
import { cache } from "react";
import { getAuthProvider } from "./provider";
import type { Principal } from "./types";

export { ROLES, isRole } from "./types";
export type { Principal, Role, AuthProvider } from "./types";
export { getAuthProvider } from "./provider";

/** The signed-in user for this request, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<Principal | null> => {
  return getAuthProvider().getCurrentUser();
});
