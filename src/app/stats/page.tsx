/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

import { BarChart3, Clock, Eye, Flame, Heart, TrendingUp } from 'lucide-react';
import { Suspense, useEffect, useMemo, useState } from 'react';

import {
  Favorite,
  getAllFavorites,
  getAllPlayRecords,
  PlayRecord,
  subscribeToDataUpdates,
} from '@/lib/db.client';

import PageLayout from '@/components/PageLayout';
import { EmptyState, PageHeader } from '@/components/UiPrimitives';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}

function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <div className='rounded-xl border border-gray-200/60 bg-white/70 p-4 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/50'>
      <div className='mb-2 flex items-center gap-2 text-green-600 dark:text-green-400'>
        {icon}
        <span className='text-sm text-gray-500 dark:text-gray-400'>
          {label}
        </span>
      </div>
      <div className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
        {value}
      </div>
      {hint && (
        <div className='mt-1 text-xs text-gray-400 dark:text-gray-500'>
          {hint}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 分钟';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function StatsPageClient() {
  const [records, setRecords] = useState<Record<string, PlayRecord>>({});
  const [favorites, setFavorites] = useState<Record<string, Favorite>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([getAllPlayRecords(), getAllFavorites()])
      .then(([plays, favs]) => {
        if (!mounted) return;
        setRecords(plays || {});
        setFavorites(favs || {});
      })
      .finally(() => mounted && setLoading(false));

    const unsubPlays = subscribeToDataUpdates<Record<string, PlayRecord>>(
      'playRecordsUpdated',
      (data) => setRecords(data || {})
    );
    const unsubFavs = subscribeToDataUpdates<Record<string, Favorite>>(
      'favoritesUpdated',
      (data) => setFavorites(data || {})
    );
    return () => {
      mounted = false;
      unsubPlays();
      unsubFavs();
    };
  }, []);

  const stats = useMemo(() => {
    const list = Object.values(records);
    const now = Date.now();
    const weekMs = 7 * 24 * 3600 * 1000;
    const monthMs = 30 * 24 * 3600 * 1000;

    const totalTime = list.reduce((sum, r) => sum + (r.play_time || 0), 0);
    const thisWeek = list.filter((r) => now - r.save_time < weekMs);
    const thisMonth = list.filter((r) => now - r.save_time < monthMs);
    const weekTime = thisWeek.reduce((sum, r) => sum + (r.play_time || 0), 0);

    // 观看最多的源
    const sourceCount = new Map<string, number>();
    list.forEach((r) => {
      const name = r.source_name || '未知来源';
      sourceCount.set(name, (sourceCount.get(name) || 0) + 1);
    });
    const topSources = Array.from(sourceCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const maxSourceCount = topSources[0]?.[1] || 1;

    // 最近 7 天每日观看数量
    const daily = Array.from({ length: 7 }, (_, i) => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - (6 - i));
      const start = dayStart.getTime();
      const end = start + 24 * 3600 * 1000;
      const count = list.filter(
        (r) => r.save_time >= start && r.save_time < end
      ).length;
      return {
        label: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
        count,
      };
    });
    const maxDaily = Math.max(1, ...daily.map((d) => d.count));

    return {
      total: list.length,
      favorites: Object.keys(favorites).length,
      totalTime,
      weekCount: thisWeek.length,
      monthCount: thisMonth.length,
      weekTime,
      topSources,
      maxSourceCount,
      daily,
      maxDaily,
    };
  }, [records, favorites]);

  if (loading) {
    return (
      <PageLayout activePath='/stats'>
        <div className='px-4 py-6 sm:px-10'>
          <div className='h-8 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700' />
          <div className='mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4'>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className='h-28 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700'
              />
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (stats.total === 0 && stats.favorites === 0) {
    return (
      <PageLayout activePath='/stats'>
        <div className='px-4 py-6 sm:px-10'>
          <PageHeader title='观看统计' subtitle='了解你的观看习惯' />
          <EmptyState
            title='还没有统计数据'
            description='开始观看或收藏影片后，这里会展示你的观看习惯'
          />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/stats'>
      <div className='px-4 pb-8 pt-5 sm:px-10 sm:pt-16'>
        <PageHeader title='观看统计' subtitle='了解你的观看习惯与偏好' />

        <div className='mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4'>
          <StatCard
            icon={<Eye className='h-4 w-4' />}
            label='观看影片'
            value={String(stats.total)}
            hint='有记录的影片数'
          />
          <StatCard
            icon={<Clock className='h-4 w-4' />}
            label='累计观看'
            value={formatDuration(stats.totalTime)}
            hint='所有记录累计时长'
          />
          <StatCard
            icon={<Flame className='h-4 w-4' />}
            label='本周观看'
            value={`${stats.weekCount} 部`}
            hint={formatDuration(stats.weekTime)}
          />
          <StatCard
            icon={<Heart className='h-4 w-4' />}
            label='我的收藏'
            value={String(stats.favorites)}
            hint={`本月观看 ${stats.monthCount} 部`}
          />
        </div>

        <div className='mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2'>
          {/* 最近 7 天观看趋势 */}
          <section className='rounded-xl border border-gray-200/60 bg-white/70 p-5 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/50'>
            <div className='mb-4 flex items-center gap-2'>
              <TrendingUp className='h-5 w-5 text-green-600 dark:text-green-400' />
              <h2 className='font-semibold text-gray-900 dark:text-gray-100'>
                最近 7 天
              </h2>
            </div>
            <div className='flex h-40 items-end justify-between gap-2'>
              {stats.daily.map((d) => (
                <div
                  key={d.label}
                  className='flex flex-1 flex-col items-center gap-2'
                >
                  <span className='text-xs text-gray-500 dark:text-gray-400'>
                    {d.count || ''}
                  </span>
                  <div
                    className='w-full rounded-t-md bg-gradient-to-t from-green-600 to-green-400 transition-all'
                    style={{
                      height: `${Math.max(
                        4,
                        (d.count / stats.maxDaily) * 100
                      )}%`,
                    }}
                  />
                  <span className='text-xs text-gray-400'>{d.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 常用资源源 */}
          <section className='rounded-xl border border-gray-200/60 bg-white/70 p-5 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/50'>
            <div className='mb-4 flex items-center gap-2'>
              <BarChart3 className='h-5 w-5 text-green-600 dark:text-green-400' />
              <h2 className='font-semibold text-gray-900 dark:text-gray-100'>
                常用资源源
              </h2>
            </div>
            <div className='space-y-3'>
              {stats.topSources.map(([name, count]) => (
                <div key={name}>
                  <div className='mb-1 flex justify-between text-sm'>
                    <span className='text-gray-700 dark:text-gray-300'>
                      {name}
                    </span>
                    <span className='text-gray-400'>{count} 部</span>
                  </div>
                  <div className='h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700'>
                    <div
                      className='h-full rounded-full bg-green-500'
                      style={{
                        width: `${(count / stats.maxSourceCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}

export default function StatsPage() {
  return (
    <Suspense>
      <StatsPageClient />
    </Suspense>
  );
}
