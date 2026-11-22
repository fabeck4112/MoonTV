import { NextResponse } from 'next/server';

import { getHotSearches } from '@/lib/hot-search';

export const runtime = 'edge';

/** GET /api/search/hot - 返回最近 24 小时的热搜榜 */
export async function GET(request: Request) {
  const limit = Math.min(
    30,
    Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 10)
  );

  return NextResponse.json(
    { list: getHotSearches(limit) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
