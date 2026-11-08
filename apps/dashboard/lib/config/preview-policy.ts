/**
 * Pure preview policy (testable without Next server runtime).
 * Production always fails closed — DASHBOARD_DEV_PREVIEW alone is never enough.
 */
export function evaluateDashboardPreview(env: {
  NODE_ENV?: string;
  DASHBOARD_DEV_PREVIEW?: string;
}): boolean {
  if (env.NODE_ENV !== "development") return false;
  return env.DASHBOARD_DEV_PREVIEW === "1";
}

export function evaluatePreviewDeniedReason(env: {
  NODE_ENV?: string;
  DASHBOARD_DEV_PREVIEW?: string;
}): string {
  if (env.NODE_ENV !== "development") {
    return "The unsigned development preview is disabled in production. Use the admin sign-in session instead.";
  }
  if (env.DASHBOARD_DEV_PREVIEW !== "1") {
    return "Set DASHBOARD_DEV_PREVIEW=1 in the dashboard server environment to enable the local development UI preview.";
  }
  return "Dashboard preview is disabled.";
}
