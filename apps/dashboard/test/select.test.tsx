import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "@/components/ui/select";

const OPTIONS = [
  { value: "all", label: "All", description: "Facebook and Instagram" },
  { value: "facebook", label: "Facebook", description: "Cached Facebook accounts" },
  { value: "instagram", label: "Instagram", description: "Cached Instagram accounts" },
] as const;

describe("Select", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens a styled list and selects a platform option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        id="plat"
        label="Platform"
        value="all"
        options={OPTIONS}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /platform/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^instagram$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /^instagram$/i }));
    expect(onChange).toHaveBeenCalledWith("instagram");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports keyboard navigation without leaving the page blank", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        id="plat"
        label="Platform"
        value="all"
        options={OPTIONS}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: /platform/i });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    const firstOption = await screen.findByRole("option", { name: /^all$/i });
    expect(firstOption).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /^facebook$/i })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("facebook");
  });
});
