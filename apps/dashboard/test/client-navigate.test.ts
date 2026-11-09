import { describe, expect, it, vi, afterEach } from "vitest";
import { navigateAfterAuth } from "@/lib/auth/client-navigate";

describe("navigateAfterAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a same-origin document navigation", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    navigateAfterAuth("/overview");
    expect(assign).toHaveBeenCalledWith("/overview");
  });
});
