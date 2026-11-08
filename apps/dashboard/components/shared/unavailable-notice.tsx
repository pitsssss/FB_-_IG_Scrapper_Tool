import { Alert } from "@/components/ui/alert";

export function UnavailableNotice({
  title = "Awaiting management API",
  children = "Live management data is unavailable for this view right now.",
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
