import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "@/lib/utils/safe-url";

describe("safeHttpUrl", () => {
  it("allows https URLs", () => {
    expect(safeHttpUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
  });

  it("rejects javascript and data schemes", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html;base64,aaaa")).toBeNull();
  });

  it("rejects credentialed URLs", () => {
    expect(safeHttpUrl("https://user:pass@example.com/x")).toBeNull();
  });
});
