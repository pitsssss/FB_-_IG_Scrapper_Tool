/**
 * Client-safe username syntax checks mirroring public API intent.
 * Server remains the source of truth; this only improves UX before 7C/7D.
 */

export type Platform = "facebook" | "instagram";

export function looksLikeUrlOrPath(input: string): boolean {
  const raw = input.trim();
  if (!raw) return false;
  if (raw.startsWith("@")) return true;
  if (raw.includes("://") || /^https?:\/\//i.test(raw)) return true;
  if (raw.includes("/") || raw.includes("\\")) return true;
  if (raw.includes("?") || raw.includes("#") || raw.includes("%")) return true;
  if (/^(www\.)?(facebook|fb|instagram)\.com\b/i.test(raw)) return true;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#]|$)/i.test(raw)) return true;
  if (/\s/.test(raw)) return true;
  return false;
}

export function validateUsername(platform: Platform, input: string): {
  ok: boolean;
  message?: string;
} {
  const raw = input.trim();
  if (!raw) return { ok: false, message: "Username is required" };
  if (looksLikeUrlOrPath(raw)) {
    return {
      ok: false,
      message: "Use a bare username only (not a URL, @handle, or path)",
    };
  }
  if (platform === "instagram") {
    if (raw.length > 30) return { ok: false, message: "Instagram usernames are at most 30 characters" };
    if (raw.includes("-")) return { ok: false, message: "Instagram usernames cannot contain hyphens" };
    if (!/^[A-Za-z0-9._]{1,30}$/.test(raw)) {
      return { ok: false, message: "Invalid Instagram username characters" };
    }
  } else {
    if (raw.length > 100) return { ok: false, message: "Facebook usernames are at most 100 characters" };
    if (!/^[A-Za-z0-9._-]{2,100}$/.test(raw)) {
      return { ok: false, message: "Invalid Facebook page username" };
    }
  }
  return { ok: true };
}
