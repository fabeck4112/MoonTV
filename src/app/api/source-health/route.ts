/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getSourceHealth, SourceHealth } from '@/lib/circuit-breaker';
import { ApiSite, getAvailableApiSites } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';

export const runtime = 'edge';

export interface SourceHealthResponse {
  sites: (ApiSite & { health: SourceHealth })[];
  updatedAt: number;
}

async function buildResponse(): Promise<SourceHealthResponse> {
  const sites = await getAvailableApiSites();
  return {
    sites: sites.map((site) => ({
      ...site,
      health: getSourceHealth(site.key),
    })),
    updatedAt: Date.now(),
  };
}

/** GET /api/source-health - 获取各采集源健康状态 */
export async function GET() {
  return NextResponse.json(await buildResponse(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * POST /api/source-health - 主动探测所有采集源
 * body: { keyword?: string }  默认使用「电影」作为探测词
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const rawKeyword =
    typeof body?.keyword === 'string' ? body.keyword.trim() : '';
  const keyword = rawKeyword.slice(0, 40) || '电影';

  const sites = await getAvailableApiSites();
  let cursor = 0;
  const concurrency = Math.min(8, sites.length);

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < sites.length) {
        const site = sites[cursor++];
        try {
          await searchFromApi(site, keyword, 5000, true);
        } catch (err) {
          console.error('探测数据源失败', site.key, err);
        }
      }
    })
  );

  return NextResponse.json(await buildResponse(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
