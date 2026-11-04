import { describe, expect, it } from "vitest";
import {
  evaluateDashboardPreview,
  evaluatePreviewDeniedReason,
} from "@/lib/config/preview-policy";

describe("dashboard preview security boundary", () => {
  it("allows preview only in development with DASHBOARD_DEV_PREVIEW=1", () => {
    expect(
      evaluateDashboardPreview({
        NODE_ENV: "development",
        DASHBOARD_DEV_PREVIEW: "1",
      }),
    ).toBe(true);
  });

  it("fails closed in production even if preview flag is set", () => {
    expect(
      evaluateDashboardPreview({
        NODE_ENV: "production",
        DASHBOARD_DEV_PREVIEW: "1",
      }),
    ).toBe(false);
  });

  it("fails closed in development without the server flag", () => {
    expect(
      evaluateDashboardPreview({
        NODE_ENV: "development",
        DASHBOARD_DEV_PREVIEW: undefined,
      }),
    ).toBe(false);
  });

  it("rejects NEXT_PUBLIC-style sole reliance by requiring exact server value", () => {
    expect(
      evaluateDashboardPreview({
        NODE_ENV: "development",
        DASHBOARD_DEV_PREVIEW: "true",
      }),
    ).toBe(false);
  });

  it("explains production denial", () => {
    expect(
      evaluatePreviewDeniedReason({ NODE_ENV: "production", DASHBOARD_DEV_PREVIEW: "1" }),
    ).toMatch(/Phase 7C/i);
  });
});
