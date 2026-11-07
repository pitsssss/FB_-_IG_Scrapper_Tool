"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/constants";

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
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      const csrf = readCookie(CSRF_COOKIE);
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [CSRF_HEADER]: csrf,
        },
        body: "{}",
      });
    } finally {
      router.replace("/login");
      router.refresh();
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} disabled={loading}>
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  );
}
