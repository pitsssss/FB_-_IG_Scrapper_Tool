import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  Database,
  KeyRound,
  LayoutDashboard,
  Plug,
  Settings,
  TerminalSquare,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const DASHBOARD_NAV: NavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    description: "Service status and summaries",
    icon: LayoutDashboard,
  },
  {
    href: "/playground",
    label: "API Playground",
    description: "Try Facebook and Instagram requests",
    icon: TerminalSquare,
  },
  {
    href: "/api-keys",
    label: "API Keys",
    description: "Client credentials and scopes",
    icon: KeyRound,
  },
  {
    href: "/providers",
    label: "Connected Providers",
    description: "Apify and optional Graph",
    icon: Plug,
  },
  {
    href: "/cache",
    label: "Cache",
    description: "Inspect cached accounts",
    icon: Database,
  },
  {
    href: "/usage",
    label: "Usage & Logs",
    description: "Local activity and attempts",
    icon: Activity,
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Deployment preferences",
    icon: Settings,
  },
  {
    href: "/docs",
    label: "API Documentation",
    description: "Public contract and examples",
    icon: BookOpen,
  },
];
