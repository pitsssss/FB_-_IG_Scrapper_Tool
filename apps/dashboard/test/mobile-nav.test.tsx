import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileNav } from "@/components/layout/mobile-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/docs",
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("mobile navigation", () => {
  beforeEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("opens a body-level drawer and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<MobileNav adminUsername="reviewer" />);

    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    const dialog = await screen.findByRole("dialog", { name: /social media posts api/i });
    expect(dialog).toBeInTheDocument();
    expect(document.getElementById("mobile-nav-drawer")?.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(dialog).getByRole("link", { name: /overview/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /sign out/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /social media posts api/i })).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe("");
  });

  it("closes when a navigation link is selected", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);
    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    const dialog = await screen.findByRole("dialog", { name: /social media posts api/i });
    await user.click(within(dialog).getByRole("link", { name: /settings/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /social media posts api/i })).not.toBeInTheDocument();
    });
  });
});
