import "server-only";
import {
  evaluateDashboardPreview,
  evaluatePreviewDeniedReason,
} from "@/lib/config/preview-policy";

/**
 * Development-only UI preview gate (Phase 7B).
 * Never use NEXT_PUBLIC_* for this flag.
 */
export function isDashboardDevPreviewEnabled(): boolean {
  return evaluateDashboardPreview({
    NODE_ENV: process.env.NODE_ENV,
    DASHBOARD_DEV_PREVIEW: process.env.DASHBOARD_DEV_PREVIEW,
  });
}

export function previewDeniedReason(): string {
  return evaluatePreviewDeniedReason({
    NODE_ENV: process.env.NODE_ENV,
    DASHBOARD_DEV_PREVIEW: process.env.DASHBOARD_DEV_PREVIEW,
  });
}
