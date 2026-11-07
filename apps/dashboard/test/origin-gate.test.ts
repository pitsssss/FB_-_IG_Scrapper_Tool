import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("BFF origin gate", () => {
  it("auth mutations import assertBrowserOrigin", () => {
    for (const rel of [
      "app/api/auth/setup/route.ts",
      "app/api/auth/login/route.ts",
      "app/api/auth/logout/route.ts",
      "app/api/auth/mfa/route.ts",
      "app/api/auth/security/route.ts",
    ]) {
      const text = fs.readFileSync(path.join(root, rel), "utf8");
      expect(text).toMatch(/assertBrowserOrigin/);
    }
  });

  it("origin helper is server-only and uses ADMIN_ALLOWED_ORIGINS", () => {
    const text = fs.readFileSync(path.join(root, "lib/auth/origin.ts"), "utf8");
    expect(text).toMatch(/server-only/);
    expect(text).toMatch(/ADMIN_ALLOWED_ORIGINS/);
    expect(text).toMatch(/CSRF_REJECTED/);
  });
});
