import "server-only";
import { cookies } from "next/headers";
import { CSRF_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth/constants";

function secureCookies(): boolean {
  if (process.env.ADMIN_COOKIE_SECURE === "1") return true;
  if (process.env.ADMIN_COOKIE_SECURE === "0") return false;
  return process.env.NODE_ENV === "production";
}

export async function readSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function readCsrfToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(CSRF_COOKIE)?.value ?? null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: secureCookies(),
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export async function setAuthCookies(sessionToken: string, csrfToken: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  jar.set(CSRF_COOKIE, csrfToken, csrfCookieOptions());
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  jar.set(CSRF_COOKIE, "", { ...csrfCookieOptions(), maxAge: 0 });
}
