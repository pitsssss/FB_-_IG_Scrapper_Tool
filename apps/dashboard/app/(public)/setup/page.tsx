import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export const metadata = { title: "Setup" };

export default function SetupPage() {
  return (
    <div>
      <PageHeader
        title="Initial administrator setup"
        description="Visual foundation only. Bootstrap tokens and passwords are not collected or stored in Phase 7B."
      />
      <Alert className="mb-6" variant="warning" title="Not implemented">
        Real one-time bootstrap and atomic admin creation ship in Phase 7C. Submission stays disabled — no account will be created.
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Planned steps</CardTitle>
          <CardDescription>Operator-supplied bootstrap secret → admin password → session</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bootstrap">Bootstrap setup token</Label>
            <Input id="bootstrap" name="bootstrap" disabled placeholder="Not collected in 7B" autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Administrator password</Label>
            <Input id="admin-password" name="password" type="password" disabled placeholder="Not collected in 7B" autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password-confirm">Confirm password</Label>
            <Input id="admin-password-confirm" type="password" disabled placeholder="Not collected in 7B" autoComplete="new-password" />
          </div>
          <Button type="button" disabled>
            Complete setup
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
