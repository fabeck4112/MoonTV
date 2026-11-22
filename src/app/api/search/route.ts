import { NextResponse } from 'next/server';

import { isCircuitOpen } from '@/lib/circuit-breaker';
import { getAvailableApiSites, getCacheTime } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { SearchResult } from '@/lib/types';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}`,
        },
      }
    );
  }

  const allSites = await getAvailableApiSites();
  // 跳过处于熔断状态的失效源，避免慢源拖慢整体搜索
  const apiSites = allSites.filter((site) => !isCircuitOpen(site.key));

  // allSettled：单个源异常不影响其他源结果
  const settled = await Promise.allSettled(
    apiSites.map((site) => searchFromApi(site, query))
  );
  const flattenedResults: SearchResult[] = [];
  settled.forEach((r) => {
    if (r.status === 'fulfilled') {
      flattenedResults.push(...r.value);
    }
  });

  const cacheTime = await getCacheTime();

  return NextResponse.json(
    { results: flattenedResults },
    {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}`,
      },
    }
  );
}
