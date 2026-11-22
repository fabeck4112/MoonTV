'use client';

import {
  Activity,
  Clock,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import { EmptyState, PageHeader } from '@/components/UiPrimitives';

type Status = 'healthy' | 'degraded' | 'down' | 'unknown';

interface Health {
  key: string;
  status: Status;
  failures: number;
  successCount: number;
  failureCount: number;
  lastLatencyMs: number;
  avgLatencyMs: number;
  lastCheckedAt: number;
  openUntil: number;
}

interface SiteInfo {
  key: string;
  api: string;
  name: string;
  health: Health;
}

interface ResponseData {
  sites: SiteInfo[];
  updatedAt: number;
}

const STATUS_META: Record<
  Status,
  { label: string; className: string; dot: string }
> = {
  healthy: {
    label: '正常',
    className:
      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    dot: 'bg-green-500',
  },
  degraded: {
    label: '异常',
    className:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  down: {
    label: '熔断',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    dot: 'bg-red-500',
  },
  unknown: {
    label: '未检测',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    dot: 'bg-gray-400',
  },
};

function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

function formatLatency(ms: number): string {
  if (!ms) return '-';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function SourcesPageClient() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [keyword, setKeyword] = useState('电影');
  const [error, setError] = useState('');

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/source-health', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError('');
    } catch {
      setError('获取数据源状态失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // 每 60 秒自动刷新一次状态
    const timer = window.setInterval(fetchHealth, 60_000);
    return () => window.clearInterval(timer);
  }, [fetchHealth]);

  const runProbe = async () => {
    setProbing(true);
    try {
      const res = await fetch('/api/source-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError('');
    } catch {
      setError('探测失败，请稍后重试');
    } finally {
      setProbing(false);
    }
  };

  const sites = data?.sites || [];
  const counts = sites.reduce(
    (acc, site) => {
      acc[site.health.status] += 1;
      return acc;
    },
    { healthy: 0, degraded: 0, down: 0, unknown: 0 } as Record<Status, number>
  );

  const summary = [
    {
      label: '数据源总数',
      value: sites.length,
      icon: Activity,
      tone: 'text-blue-500',
    },
    {
      label: '正常',
      value: counts.healthy,
      icon: ShieldCheck,
      tone: 'text-green-500',
    },
    {
      label: '异常',
      value: counts.degraded,
      icon: TriangleAlert,
      tone: 'text-amber-500',
    },
    { label: '已熔断', value: counts.down, icon: Clock, tone: 'text-red-500' },
  ];

  return (
    <PageLayout activePath='/sources'>
      <div className='px-4 pb-6 pt-5 sm:px-10 sm:pb-8 md:pt-16'>
        <PageHeader
          title='数据源健康'
          subtitle='实时查看采集源可用性与响应速度，搜索时自动跳过已熔断的源'
          action={
            <div className='flex items-center gap-2'>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder='探测关键词'
                maxLength={40}
                className='h-9 w-28 rounded-lg border border-gray-200 bg-white/90 px-3 text-sm outline-none focus:border-green-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:w-36'
              />
              <button
                onClick={runProbe}
                disabled={probing}
                className='inline-flex h-9 items-center gap-2 rounded-lg bg-green-500 px-3 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60'
              >
                <RefreshCw
                  className={`h-4 w-4 ${probing ? 'animate-spin' : ''}`}
                />
                {probing ? '检测中...' : '重新检测'}
              </button>
            </div>
          }
        />

        <div className='mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4'>
          {summary.map((item) => (
            <div
              key={item.label}
              className='rounded-xl border border-gray-200/70 bg-white/70 p-4 shadow-sm dark:border-gray-700/70 dark:bg-gray-900/50'
            >
              <div className='flex items-center justify-between'>
                <span className='text-sm text-gray-600 dark:text-gray-400'>
                  {item.label}
                </span>
                <item.icon className={`h-4 w-4 ${item.tone}`} />
              </div>
              <p className='mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100'>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {error && (
          <p className='mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400'>
            {error}
          </p>
        )}

        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className='h-14 animate-pulse rounded-lg bg-gray-200/70 dark:bg-gray-800'
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <EmptyState
            icon={<Activity className='h-10 w-10' />}
            title='暂无数据源'
            description='请检查 config.json 中的 api_site 配置'
          />
        ) : (
          <>
            {/* 桌面表格 */}
            <div className='hidden overflow-hidden rounded-xl border border-gray-200/70 bg-white/70 shadow-sm md:block dark:border-gray-700/70 dark:bg-gray-900/50'>
              <table className='w-full text-left text-sm'>
                <thead className='border-b border-gray-200/70 bg-gray-50/80 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400'>
                  <tr>
                    <th className='px-4 py-3 font-medium'>数据源</th>
                    <th className='px-4 py-3 font-medium'>状态</th>
                    <th className='px-4 py-3 font-medium'>响应时间</th>
                    <th className='px-4 py-3 font-medium'>成功/失败</th>
                    <th className='px-4 py-3 font-medium'>最近检测</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-200/60 dark:divide-gray-800'>
                  {sites.map((site) => {
                    const meta = STATUS_META[site.health.status];
                    return (
                      <tr
                        key={site.key}
                        className='transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40'
                      >
                        <td className='px-4 py-3'>
                          <p className='font-medium text-gray-800 dark:text-gray-200'>
                            {site.name}
                          </p>
                          <p className='max-w-xs truncate text-xs text-gray-400 dark:text-gray-500'>
                            {site.key}
                          </p>
                        </td>
                        <td className='px-4 py-3'>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
                            />
                            {meta.label}
                            {site.health.openUntil > Date.now() && (
                              <span>
                                ·
                                {Math.ceil(
                                  (site.health.openUntil - Date.now()) / 1000
                                )}
                                s
                              </span>
                            )}
                          </span>
                        </td>
                        <td className='px-4 py-3 text-gray-600 dark:text-gray-300'>
                          {formatLatency(site.health.lastLatencyMs)}
                          {site.health.avgLatencyMs > 0 && (
                            <span className='ml-1 text-xs text-gray-400'>
                              (均值 {formatLatency(site.health.avgLatencyMs)})
                            </span>
                          )}
                        </td>
                        <td className='px-4 py-3 text-gray-600 dark:text-gray-300'>
                          <span className='text-green-600 dark:text-green-400'>
                            {site.health.successCount}
                          </span>
                          {' / '}
                          <span className='text-red-500 dark:text-red-400'>
                            {site.health.failureCount}
                          </span>
                        </td>
                        <td className='px-4 py-3 text-gray-500 dark:text-gray-400'>
                          {formatTime(site.health.lastCheckedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片 */}
            <div className='space-y-2 md:hidden'>
              {sites.map((site) => {
                const meta = STATUS_META[site.health.status];
                return (
                  <div
                    key={site.key}
                    className='rounded-xl border border-gray-200/70 bg-white/70 p-4 shadow-sm dark:border-gray-700/70 dark:bg-gray-900/50'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <p className='truncate font-medium text-gray-800 dark:text-gray-200'>
                          {site.name}
                        </p>
                        <p className='truncate text-xs text-gray-400'>
                          {site.key}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className='mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400'>
                      <span>
                        响应 {formatLatency(site.health.lastLatencyMs)}
                      </span>
                      <span>
                        成功 {site.health.successCount} / 失败{' '}
                        {site.health.failureCount}
                      </span>
                      <span>{formatTime(site.health.lastCheckedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className='mt-5 text-xs leading-relaxed text-gray-500 dark:text-gray-400'>
          说明：状态与统计保存在当前服务实例内存中，实例重启后会重置；连续失败 3
          次的源会被熔断 5 分钟，搜索时自动跳过。
          {data?.updatedAt && ` 最近更新：${formatTime(data.updatedAt)}`}
        </p>
      </div>
    </PageLayout>
  );
}

export default function SourcesPage() {
  return (
    <Suspense>
      <SourcesPageClient />
    </Suspense>
  );
}
