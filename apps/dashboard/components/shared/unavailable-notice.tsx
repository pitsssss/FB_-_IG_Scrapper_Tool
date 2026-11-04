import { Alert } from "@/components/ui/alert";

export function UnavailableNotice({
  title = "Awaiting management API",
  children = "This capability is designed for Phase 7C/7D. No live data or mutations are available in the 7B foundation.",
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <Alert variant="info" title={title}>
      {children}
    </Alert>
  );
}
