import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, createSessionToken, verifySessionToken } from "@/platform/auth/session-token";
import { isValidIban } from "@/platform/validation/iban";
import { safeRedirectPath } from "@/platform/validation/redirect";

const SECRET = "x".repeat(40);

describe("session token", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken("user-1", Date.now(), SECRET);
    expect(verifySessionToken(token, Date.now(), SECRET)?.sub).toBe("user-1");
  });

  it("rejects tampered, foreign, expired and malformed tokens", () => {
    const now = Date.now();
    const token = createSessionToken("user-1", now, SECRET);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ sub: "admin", iat: 0, exp: 9e9 })).toString("base64url")}.${sig}`;
    expect(verifySessionToken(forged, now, SECRET)).toBeNull();
    expect(verifySessionToken(token, now, "y".repeat(40))).toBeNull();
    expect(verifySessionToken(token, now + (SESSION_TTL_SECONDS + 1) * 1000, SECRET)).toBeNull();
    for (const bad of [undefined, "", "abc", "a.b.c", "....", `${token}.x`]) {
      expect(verifySessionToken(bad, now, SECRET)).toBeNull();
    }
  });
});

describe("helpers", () => {
  it("only allows same-origin relative redirects", () => {
    expect(safeRedirectPath("/apps/customers?x=1")).toBe("/apps/customers?x=1");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined]) {
      expect(safeRedirectPath(bad)).toBe("/");
    }
  });

  it("validates IBAN checksums", () => {
    expect(isValidIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(isValidIban("GB82WEST12345698765433")).toBe(false);
    expect(isValidIban("not-an-iban")).toBe(false);
  });
});
