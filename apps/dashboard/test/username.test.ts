import { describe, expect, it } from "vitest";
import { validateUsername } from "@/lib/utils/username";

describe("username validation UI helpers", () => {
  it("accepts bare facebook and instagram usernames", () => {
    expect(validateUsername("facebook", "cern").ok).toBe(true);
    expect(validateUsername("instagram", "nasa").ok).toBe(true);
    expect(validateUsername("instagram", "nat.geo_1").ok).toBe(true);
  });

  it("rejects urls and @handles", () => {
    expect(validateUsername("facebook", "https://www.facebook.com/cern").ok).toBe(false);
    expect(validateUsername("instagram", "@nasa").ok).toBe(false);
    expect(validateUsername("instagram", "https://www.instagram.com/nasa/").ok).toBe(false);
  });

  it("rejects instagram hyphens", () => {
    expect(validateUsername("instagram", "bad-name").ok).toBe(false);
  });
});
