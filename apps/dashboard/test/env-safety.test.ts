import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|md|example|env).*?$/.test(entry.name) || entry.name.endsWith(".example")) {
      out.push(full);
    }
  }
  return out;
}

describe("environment safety", () => {
  it("does not introduce NEXT_PUBLIC_ secret or preview flags in code/config", () => {
    const files = walk(root).filter((f) => !f.endsWith(`${path.sep}README.md`));
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      // Flag executable config / code that defines forbidden public env vars.
      if (/NEXT_PUBLIC_DASHBOARD_DEV_PREVIEW\s*=/.test(text)) {
        offenders.push(path.relative(root, file));
      }
      if (/process\.env\.NEXT_PUBLIC_.*(TOKEN|KEY|SECRET|PASSWORD|APIFY|PREVIEW)/i.test(text)) {
        offenders.push(path.relative(root, file));
      }
      if (/NEXT_PUBLIC_[A-Z0-9_]*(TOKEN|KEY|SECRET|PASSWORD|APIFY)\s*=/.test(text)) {
        offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("documents API_INTERNAL_URL as server-only", () => {
    const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    expect(example).toMatch(/API_INTERNAL_URL=/);
    expect(example).not.toMatch(/NEXT_PUBLIC_API/);
  });
});
