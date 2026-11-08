import { afterEach, vi } from "vitest";
import { cookieJar } from "./next";

vi.mock("next/headers", async () => {
  const { cookieStore } = await import("./next");
  return { cookies: async () => cookieStore };
});

vi.mock("next/navigation", async () => {
  const { RedirectError } = await import("./next");
  return {
    redirect: (url: string) => {
      throw new RedirectError(url);
    },
    notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
    },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

afterEach(() => cookieJar.clear());
