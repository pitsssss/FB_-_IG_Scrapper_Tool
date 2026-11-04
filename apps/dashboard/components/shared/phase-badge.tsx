import { Badge } from "@/components/ui/badge";

export function PhaseBadge({ label = "UI foundation — not production-ready" }: { label?: string }) {
  return <Badge variant="warning">{label}</Badge>;
}
