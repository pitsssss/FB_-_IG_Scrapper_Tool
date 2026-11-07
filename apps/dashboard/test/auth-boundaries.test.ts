import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("dashboard auth boundaries", () => {
  it("protects dashboard layout with requireAdmin", () => {
    const layout = read("app/(dashboard)/layout.tsx");
    expect(layout).toMatch(/requireAdmin/);
  });

  it("middleware redirects unauthenticated users", () => {
    const mw = read("middleware.ts");
    expect(mw).toMatch(/SESSION_COOKIE/);
    expect(mw).toMatch(/\/login/);
  });

  it("does not expose API_INTERNAL_URL or ADMIN_INTERNAL_SECRET to the browser", () => {
    const env = read("lib/config/env.ts");
    expect(env).toMatch(/server-only/);
    expect(env).not.toMatch(/NEXT_PUBLIC_API_INTERNAL/);
    const api = read("lib/auth/api.ts");
    expect(api).toMatch(/server-only/);
    expect(api).toMatch(/ADMIN_INTERNAL_SECRET/);
  });

  it("BFF strips sessionToken from browser responses", () => {
    const login = read("app/api/auth/login/route.ts");
    expect(login).toMatch(/admin:\s*result\.body\.data\.admin/);
    expect(login).not.toMatch(/sessionToken:\s*result/);
    const setup = read("app/api/auth/setup/route.ts");
    expect(setup).toMatch(/admin:\s*result\.body\.data\.admin/);
    expect(setup).not.toMatch(/data:\s*safe/);
  });

  it("root layout no longer uses LockedScreen preview gate alone", () => {
    const layout = read("app/layout.tsx");
    expect(layout).not.toMatch(/LockedScreen/);
    expect(layout).not.toMatch(/isDashboardDevPreviewEnabled/);
  });
});
