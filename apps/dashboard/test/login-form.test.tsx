import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/features/auth/login-form";
import { navigateAfterAuth } from "@/lib/auth/client-navigate";

vi.mock("@/lib/auth/client-navigate", () => ({
  navigateAfterAuth: vi.fn(),
}));

describe("login form navigation", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(navigateAfterAuth).mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, data: { admin: { id: 1 }, csrfToken: "x", mfaRequired: false } }),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("navigates to overview after successful login without soft-router refresh", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email or username/i), "admin@example.com");
    await user.type(screen.getByLabelText(/password/i), "CorrectHorseBattery");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => {
      expect(navigateAfterAuth).toHaveBeenCalledWith("/overview");
    });
    expect(screen.queryByText(/could not sign in/i)).not.toBeInTheDocument();
  });

  it("keeps the user on login when credentials are rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid credentials" },
        }),
      })),
    );
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email or username/i), "admin@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
    expect(navigateAfterAuth).not.toHaveBeenCalled();
  });

  it("sends MFA users to the challenge page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          data: { admin: { id: 1 }, csrfToken: "x", mfaRequired: true },
        }),
      })),
    );
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email or username/i), "admin@example.com");
    await user.type(screen.getByLabelText(/password/i), "CorrectHorseBattery");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => {
      expect(navigateAfterAuth).toHaveBeenCalledWith("/mfa");
    });
  });
});
