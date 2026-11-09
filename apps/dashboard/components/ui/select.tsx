"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

type SelectProps<T extends string = string> = {
  id?: string;
  name?: string;
  label?: string;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  "aria-label"?: string;
};

export function Select<T extends string = string>({
  id,
  name,
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
  triggerClassName,
  "aria-label": ariaLabel,
}: SelectProps<T>) {
  const listId = React.useId();
  const labelId = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const activeIndexRef = React.useRef(0);

  const selected = options.find((option) => option.value === value) ?? options[0];

  const selectedIndex = React.useMemo(() => {
    const index = options.findIndex((option) => option.value === value);
    return index >= 0 ? index : 0;
  }, [options, value]);

  const setActive = React.useCallback((index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  }, []);

  const openList = React.useCallback(() => {
    if (disabled) return;
    setActive(selectedIndex);
    setOpen(true);
  }, [disabled, selectedIndex, setActive]);

  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const choose = React.useCallback(
    (next: T) => {
      onChange(next);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  React.useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[activeIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, activeIndex]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target || !rootRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  function moveActive(delta: number) {
    const next = (activeIndexRef.current + delta + options.length) % options.length;
    setActive(next);
    optionRefs.current[next]?.focus();
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openList();
    }
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      optionRefs.current[0]?.focus();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const last = options.length - 1;
      setActive(last);
      optionRefs.current[last]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndexRef.current];
      if (option) choose(option.value);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative w-full min-w-0", className)}>
      {label ? (
        <label id={labelId} htmlFor={id} className="text-sm font-medium text-[var(--foreground)]">
          {label}
        </label>
      ) : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        onClick={() => {
          if (disabled) return;
          if (open) close();
          else openList();
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-start text-base text-[var(--foreground)] shadow-[var(--shadow-sm)] transition-colors",
          "hover:bg-[var(--muted)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          "disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
          open && "ring-2 ring-[var(--ring)]",
          triggerClassName,
        )}
      >
        <span className="min-w-0 truncate font-medium">{selected?.label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className={cn(
            "absolute start-0 z-40 mt-1 w-full min-w-[12rem] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_32px_rgb(16_24_40_/_0.14)]",
            "max-h-[min(18rem,var(--select-panel-max,70dvh))]",
          )}
        >
          <div className="max-h-[inherit] overflow-y-auto overscroll-contain p-1.5">
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={option.value}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={isActive ? 0 : -1}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option.value)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-start text-base transition-colors sm:min-h-10 sm:text-sm",
                    isActive && "bg-[var(--muted)]",
                    isSelected && "bg-[var(--primary-muted)] text-[var(--foreground)]",
                    !isSelected && "text-[var(--foreground)]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{option.label}</span>
                    {option.description ? (
                      <span
                        aria-hidden="true"
                        className="mt-0.5 block text-xs text-[var(--muted-foreground)]"
                      >
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0 text-[var(--primary)]",
                      isSelected ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
