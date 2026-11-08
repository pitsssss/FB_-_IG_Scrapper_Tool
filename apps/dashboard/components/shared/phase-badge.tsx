import { Badge } from "@/components/ui/badge";

export function PhaseBadge({ label = "Beta" }: { label?: string }) {
  return <Badge variant="warning">{label}</Badge>;
}
