import { NextResponse } from 'next/server';

import { getSourceHealth, isCircuitOpen } from '@/lib/circuit-breaker';
import { getAvailableApiSites } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { recordSearch } from '@/lib/hot-search';
import { SearchResult } from '@/lib/types';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json(
      { results: [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // 记录热搜（best-effort，不影响搜索结果）
  recordSearch(query);

  const allSites = await getAvailableApiSites();
  // 跳过处于熔断状态的失效源，并按健康度排序，让稳定源优先返回
  const apiSites = allSites
    .filter((site) => !isCircuitOpen(site.key))
    .sort(
      (a, b) =>
        getSourceHealth(b.key).score - getSourceHealth(a.key).score ||
        a.name.localeCompare(b.name)
    );

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

  return NextResponse.json(
    { results: flattenedResults },
    {
      headers: {
        // 搜索结果依赖实时熔断/热搜状态，不使用长缓存
        'Cache-Control': 'no-store',
      },
    }
  );
}
