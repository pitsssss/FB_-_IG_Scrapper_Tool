import { describe, expect, it } from "vitest";
import {
  evaluateDashboardPreview,
  evaluatePreviewDeniedReason,
} from "@/lib/config/preview-policy";

/**
 * Preview gate remains as a development utility, but production access
 * is enforced by real session auth (middleware + dashboard layout).
 */
describe("legacy preview policy helper", () => {
  it("still fails closed in production", () => {
    expect(
      evaluateDashboardPreview({
        NODE_ENV: "production",
        DASHBOARD_DEV_PREVIEW: "1",
      }),
    ).toBe(false);
  });

  it("allows only explicit development preview flag", () => {
    expect(
      evaluateDashboardPreview({
        NODE_ENV: "development",
        DASHBOARD_DEV_PREVIEW: "1",
      }),
    ).toBe(true);
    expect(
      evaluateDashboardPreview({
        NODE_ENV: "development",
        DASHBOARD_DEV_PREVIEW: "true",
      }),
    ).toBe(false);
  });

  it("explains denial without implying auth is missing forever", () => {
    expect(
      evaluatePreviewDeniedReason({ NODE_ENV: "production", DASHBOARD_DEV_PREVIEW: "1" }),
    ).toMatch(/authentication|Phase 7C|production/i);
  });
});
