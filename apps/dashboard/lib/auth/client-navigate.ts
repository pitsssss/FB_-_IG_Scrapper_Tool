/**
 * After Set-Cookie auth responses, App Router soft navigation can race with
 * router.refresh() and leave the client on a stale public route. A same-origin
 * document navigation guarantees the new session cookie is used for the next
 * RSC/middleware pass.
 */
export function navigateAfterAuth(path: "/overview" | "/mfa" | "/login"): void {
  if (typeof window === "undefined") return;
  window.location.assign(path);
}
