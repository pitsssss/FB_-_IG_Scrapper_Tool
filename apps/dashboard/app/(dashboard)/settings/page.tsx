import { PageHeader } from "@/components/layout/page-header";
import { UnavailableNotice } from "@/components/shared/unavailable-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

const SECTIONS = [
  {
    id: "general",
    title: "General",
    description: "Deployment display name and public origin (restart may be required).",
  },
  {
    id: "api",
    title: "API behavior",
    description: "Rate limits, max posts, provider order.",
  },
  {
    id: "cache",
    title: "Cache",
    description: "Fresh TTL, warmer lists, cooldown.",
  },
  {
    id: "providers",
    title: "Provider preferences",
    description: "Enrichment toggles and Actor timeouts.",
  },
  {
    id: "limits",
    title: "Usage limits",
    description: "Daily Apify attempt budget and optional USD cap.",
  },
  {
    id: "admin",
    title: "Administrator account",
    description: "Password change after Phase 7C auth.",
  },
  {
    id: "security",
    title: "Security",
    description: "Session lifetime, encryption key rotation notes.",
  },
] as const;

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Organized preferences UI. No secret writes and no .env mutation from the browser in Phase 7B."
      />
      <div className="mb-6">
        <UnavailableNotice>All controls are illustrative. Saving is disabled until management APIs exist.</UnavailableNotice>
      </div>
      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <Card key={section.id} id={section.id}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor={`${section.id}-placeholder`}>Placeholder field</Label>
                <Input id={`${section.id}-placeholder`} disabled placeholder="Unavailable" />
              </div>
              <Button type="button" disabled>
                Save changes
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
