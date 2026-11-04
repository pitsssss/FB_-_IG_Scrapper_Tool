import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DASHBOARD_NAV } from "@/lib/navigation";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { CodeBlock } from "@/components/ui/code-block";
import { PlaygroundRequestBuilder } from "@/features/playground/request-builder";

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
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

describe("navigation and shared UI", () => {
  it("renders all primary nav links with active overview", () => {
    render(<SidebarNav />);
    for (const item of DASHBOARD_NAV) {
      expect(screen.getByRole("link", { name: new RegExp(item.label, "i") })).toHaveAttribute(
        "href",
        item.href,
      );
    }
    expect(screen.getByRole("link", { name: /overview/i })).toHaveAttribute("aria-current", "page");
  });

  it("renders empty states without invented metrics", () => {
    render(
      <EmptyState title="No activity data available" description="Awaiting management API" />,
    );
    expect(screen.getByText(/no activity data available/i)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("copies documentation snippets", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<CodeBlock code="curl example" />);
    await user.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("curl example");
  });

  it("supports platform selection and username validation without sending", async () => {
    const user = userEvent.setup();
    render(<PlaygroundRequestBuilder />);
    await user.click(screen.getByRole("button", { name: /^instagram$/i }));
    const input = screen.getByLabelText(/username/i);
    await user.clear(input);
    await user.type(input, "https://www.instagram.com/nasa/");
    expect(
      await screen.findByText(/not a URL, @handle, or path/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send request/i })).toBeDisabled();
  });
});
