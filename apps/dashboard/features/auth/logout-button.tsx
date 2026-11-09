"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/constants";
import { navigateAfterAuth } from "@/lib/auth/client-navigate";

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return "";
  return decodeURIComponent(match.slice(name.length + 1));
}

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    try {
      const csrf = readCookie(CSRF_COOKIE);
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          [CSRF_HEADER]: csrf,
        },
        body: "{}",
      });
    } finally {
      navigateAfterAuth("/login");
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} disabled={loading}>
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  );
}
