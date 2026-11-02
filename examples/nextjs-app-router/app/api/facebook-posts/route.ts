import { NextResponse } from 'next/server';
import { fetchFacebookPosts } from '../../../lib/fb-posts';

export async function GET() {
  const result = await fetchFacebookPosts({ timeoutMs: 20_000 });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: { code: 'UPSTREAM', message: result.reason } },
      { status: result.status >= 400 ? result.status : 502 },
    );
  }
  return NextResponse.json(result.data);
}
