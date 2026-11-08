import "server-only";
import { mockAuthProvider } from "./mock/provider";
import type { AuthProvider } from "./types";

const providers: Record<string, AuthProvider> = {
  mock: mockAuthProvider,
  // entra: entraAuthProvider,  <- future Microsoft Entra ID implementation
};

export function getAuthProvider(): AuthProvider {
  const id = process.env.AUTH_PROVIDER ?? "mock";
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown AUTH_PROVIDER "${id}"`);
  return provider;
}
