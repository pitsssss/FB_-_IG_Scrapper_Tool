import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export const metadata = { title: "Login" };

export default function LoginPage() {
  return (
    <div>
      <PageHeader
        title="Administrator login"
        description="Session cookies and CSRF protection arrive in Phase 7C. This page does not authenticate."
      />
      <Alert className="mb-6" variant="warning" title="Login disabled">
        There is no password check, mock cookie, or demo credential. Do not treat this screen as access control.
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Separate from public x-api-key integrations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" disabled placeholder="Not available" autoComplete="username" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" disabled placeholder="Not available" autoComplete="current-password" />
          </div>
          <Button type="button" disabled>
            Sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
