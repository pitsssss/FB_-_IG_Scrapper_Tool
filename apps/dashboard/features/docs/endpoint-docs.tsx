import { CodeBlock } from "@/components/ui/code-block";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

const CURL_FB = `curl -s "http://127.0.0.1:3000/api/v1/facebook/posts?page=cern&limit=10" \\
  -H "x-api-key: YOUR_API_KEY"`;

const CURL_IG = `curl -s "http://127.0.0.1:3000/api/v1/instagram/posts?page=nasa&limit=10" \\
  -H "x-api-key: YOUR_API_KEY"`;

const FETCH_FB = `const res = await fetch(
  "http://127.0.0.1:3000/api/v1/facebook/posts?page=cern&limit=10",
  { headers: { "x-api-key": process.env.API_KEY } }
);
const json = await res.json();`;

export function EndpointDocs() {
  return (
    <div className="space-y-6">
      <Alert variant="info" title="Public contract">
        Authentication uses <code className="font-mono text-xs">x-api-key</code>. Never place real keys in the
        dashboard or client bundles. Examples use placeholders only.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Health</CardTitle>
          <CardDescription>
            <code className="font-mono text-xs">GET /health</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-[var(--muted-foreground)]">
          Returns <code className="font-mono text-xs">{"{ \"status\": \"ok\" }"}</code>. No authentication.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Facebook posts</CardTitle>
          <CardDescription>
            <code className="font-mono text-xs">GET /api/v1/facebook/posts</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ParamTable
            rows={[
              ["page", "yes", "Bare Facebook page username (e.g. cern)"],
              ["limit", "no", "1..MAX_POSTS (default typically 10)"],
            ]}
          />
          <CodeBlock code={CURL_FB} />
          <CodeBlock code={FETCH_FB} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instagram posts</CardTitle>
          <CardDescription>
            <code className="font-mono text-xs">GET /api/v1/instagram/posts</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ParamTable
            rows={[
              ["page", "yes", "Bare Instagram username (e.g. nasa)"],
              ["limit", "no", "1..MAX_POSTS (default typically 10)"],
            ]}
          />
          <CodeBlock code={CURL_IG} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shared response shape</CardTitle>
          <CardDescription>Stable success and error envelopes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
          <p>
            Success: <code className="font-mono text-xs">{"{ success, data: { page, posts[] }, meta }"}</code>
          </p>
          <p>
            Error: <code className="font-mono text-xs">{"{ success: false, error: { code, message } }"}</code>
          </p>
          <p>Common statuses: 401 UNAUTHORIZED, 400 INVALID_PAGE_URL / MISSING_PAGE, 403 PAGE_NOT_ALLOWED, 429 RATE_LIMITED, 502 UPSTREAM_UNAVAILABLE.</p>
          <p>
            Full details: repository file <code className="font-mono text-xs">docs/API_CONTRACT.md</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ParamTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Required</th>
            <th className="px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, req, desc]) => (
            <tr key={name} className="border-t border-[var(--border)]">
              <td className="px-3 py-2 font-mono text-sm [overflow-wrap:anywhere]">{name}</td>
              <td className="px-3 py-2">{req}</td>
              <td className="px-3 py-2 text-[var(--muted-foreground)]">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
