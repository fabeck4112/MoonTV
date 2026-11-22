/* eslint-disable @next/next/no-img-element, no-console */
'use client';

import {
  CheckSquare,
  Download,
  Heart,
  History,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import {
  clearAllFavorites,
  clearAllPlayRecords,
  deleteFavorite,
  deletePlayRecord,
  Favorite,
  getAllFavorites,
  getAllPlayRecords,
  PlayRecord,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { processImageUrl } from '@/lib/utils';

import PageLayout from '@/components/PageLayout';
import {
  EmptyState,
  PageHeader,
  SkeletonGrid,
} from '@/components/UiPrimitives';

type Tab = 'favorites' | 'records';
type SortMode = 'recent' | 'title' | 'year' | 'progress';

interface LibraryItem {
  key: string;
  source: string;
  id: string;
  title: string;
  cover: string;
  year: string;
  sourceName: string;
  saveTime: number;
  searchTitle: string;
  totalEpisodes?: number;
  index?: number;
  playTime?: number;
  totalTime?: number;
}

function splitKey(key: string): [string, string] {
  const index = key.indexOf('+');
  if (index < 0) return [key, ''];
  return [key.slice(0, index), key.slice(index + 1)];
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0 分钟';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

function LibraryPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: Tab =
    searchParams.get('tab') === 'records' ? 'records' : 'favorites';

  const [favorites, setFavorites] = useState<Record<string, Favorite>>({});
  const [records, setRecords] = useState<Record<string, PlayRecord>>({});
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [favs, plays] = await Promise.all([
        getAllFavorites(),
        getAllPlayRecords(),
      ]);
      setFavorites(() => favs || {});
      setRecords(() => plays || {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsubFavorites = subscribeToDataUpdates<Record<string, Favorite>>(
      'favoritesUpdated',
      (data) => setFavorites(data || {})
    );
    const unsubRecords = subscribeToDataUpdates<Record<string, PlayRecord>>(
      'playRecordsUpdated',
      (data) => setRecords(data || {})
    );
    return () => {
      unsubFavorites();
      unsubRecords();
    };
  }, [loadData]);

  useEffect(() => {
    setSelected(new Set());
    setSelectionMode(false);
  }, [tab]);

  const allItems = useMemo<LibraryItem[]>(() => {
    if (tab === 'favorites') {
      return Object.entries(favorites).map(([key, item]) => ({
        key,
        source: splitKey(key)[0],
        id: splitKey(key)[1],
        title: item.title,
        cover: item.cover,
        year: item.year,
        sourceName: item.source_name,
        saveTime: item.save_time,
        searchTitle: item.search_title || item.title,
        totalEpisodes: item.total_episodes,
      }));
    }
    return Object.entries(records).map(([key, item]) => ({
      key,
      source: splitKey(key)[0],
      id: splitKey(key)[1],
      title: item.title,
      cover: item.cover,
      year: item.year,
      sourceName: item.source_name,
      saveTime: item.save_time,
      searchTitle: item.search_title || item.title,
      totalEpisodes: item.total_episodes,
      index: item.index,
      playTime: item.play_time,
      totalTime: item.total_time,
    }));
  }, [favorites, records, tab]);

  const visibleItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const filtered = q
      ? allItems.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.sourceName.toLowerCase().includes(q) ||
            item.searchTitle.toLowerCase().includes(q)
        )
      : allItems;

    return [...filtered].sort((a, b) => {
      switch (sortMode) {
        case 'title':
          return a.title.localeCompare(b.title, 'zh-CN');
        case 'year':
          return (b.year || '').localeCompare(a.year || '');
        case 'progress':
          return (
            (b.totalTime ? (b.playTime || 0) / b.totalTime : 0) -
            (a.totalTime ? (a.playTime || 0) / a.totalTime : 0)
          );
        default:
          return b.saveTime - a.saveTime;
      }
    });
  }, [allItems, keyword, sortMode]);

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(
      selected.size === visibleItems.length
        ? new Set()
        : new Set(visibleItems.map((item) => item.key))
    );
  };

  const removeKeys = async (keys: string[]) => {
    if (!keys.length) return;
    if (!window.confirm(`确定删除选中的 ${keys.length} 条记录吗？`)) return;

    setBusy(true);
    try {
      await Promise.all(
        keys.map((key) => {
          const [source, id] = splitKey(key);
          return tab === 'favorites'
            ? deleteFavorite(source, id)
            : deletePlayRecord(source, id);
        })
      );
      setSelected(new Set());
      await loadData();
    } catch (err) {
      console.error('删除失败', err);
      window.alert('删除失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (!allItems.length) return;
    if (
      !window.confirm(
        `确定清空全部${
          tab === 'favorites' ? '收藏' : '播放记录'
        }吗？此操作不可恢复。`
      )
    )
      return;

    setBusy(true);
    try {
      if (tab === 'favorites') await clearAllFavorites();
      else await clearAllPlayRecords();
      setSelected(new Set());
      await loadData();
    } catch (err) {
      console.error('清空失败', err);
      window.alert('清空失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const exportData = () => {
    const items = keyword.trim()
      ? visibleItems
      : tab === 'favorites'
      ? favorites
      : records;
    const payload = {
      type: tab,
      exportedAt: new Date().toISOString(),
      items,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `moontv-${tab}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const getPlayHref = (item: LibraryItem) => {
    const params = new URLSearchParams({
      source: item.source,
      id: item.id,
      title: item.title,
      year: item.year || '',
      stitle: item.searchTitle,
    });
    return `/play?${params.toString()}`;
  };

  return (
    <PageLayout activePath='/library'>
      <div className='px-4 pb-6 pt-5 sm:px-10 sm:pb-8 md:pt-16'>
        <PageHeader
          title='我的片库'
          subtitle='集中管理收藏与观看记录，支持搜索、批量删除和数据导出'
          action={
            <button
              onClick={exportData}
              disabled={!allItems.length}
              className='inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white/80 px-3 text-sm text-gray-700 transition-colors hover:border-green-400 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
            >
              <Download className='h-4 w-4' />
              导出 JSON
            </button>
          }
        />

        <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
          <div className='inline-flex rounded-xl bg-gray-200/60 p-1 dark:bg-gray-800/80'>
            <button
              onClick={() => router.push('/library?tab=favorites')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === 'favorites'
                  ? 'bg-white text-green-700 shadow-sm dark:bg-gray-700 dark:text-green-400'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400'
              }`}
            >
              <Heart className='h-4 w-4' />
              我的收藏
              <span className='text-xs opacity-70'>
                {Object.keys(favorites).length}
              </span>
            </button>
            <button
              onClick={() => router.push('/library?tab=records')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === 'records'
                  ? 'bg-white text-green-700 shadow-sm dark:bg-gray-700 dark:text-green-400'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400'
              }`}
            >
              <History className='h-4 w-4' />
              观看记录
              <span className='text-xs opacity-70'>
                {Object.keys(records).length}
              </span>
            </button>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder='搜索标题或资源源'
                className='h-9 w-44 rounded-lg border border-gray-200 bg-white/90 pl-9 pr-3 text-sm outline-none focus:border-green-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:w-56'
              />
            </div>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className='h-9 rounded-lg border border-gray-200 bg-white/90 px-2 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
            >
              <option value='recent'>最近保存</option>
              <option value='title'>标题排序</option>
              <option value='year'>年份最新</option>
              <option value='progress'>观看进度</option>
            </select>
            <button
              onClick={() => {
                setSelectionMode((value) => !value);
                setSelected(new Set());
              }}
              disabled={!visibleItems.length}
              className='inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white/90 px-3 text-sm text-gray-700 transition-colors hover:border-green-400 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
            >
              {selectionMode ? (
                <CheckSquare className='h-4 w-4' />
              ) : (
                <Square className='h-4 w-4' />
              )}
              {selectionMode ? '取消选择' : '批量管理'}
            </button>
          </div>
        </div>

        {selectionMode && visibleItems.length > 0 && (
          <div className='mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-green-200/70 bg-green-50/70 px-4 py-3 text-sm dark:border-green-900/50 dark:bg-green-950/30'>
            <button
              onClick={selectAll}
              className='text-green-700 hover:underline dark:text-green-400'
            >
              {selected.size === visibleItems.length ? '取消全选' : '全选'}
            </button>
            <span className='text-gray-600 dark:text-gray-300'>
              已选 {selected.size} 项
            </span>
            <div className='ml-auto flex gap-2'>
              <button
                onClick={() => removeKeys(Array.from(selected))}
                disabled={!selected.size || busy}
                className='inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-white transition-colors hover:bg-red-600 disabled:opacity-50'
              >
                <Trash2 className='h-4 w-4' />
                删除选中
              </button>
              <button
                onClick={clearAll}
                disabled={busy}
                className='rounded-lg border border-red-300 px-3 py-1.5 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950/40'
              >
                清空列表
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <SkeletonGrid />
        ) : visibleItems.length === 0 ? (
          <EmptyState
            icon={
              tab === 'favorites' ? (
                <Heart className='h-10 w-10' />
              ) : (
                <History className='h-10 w-10' />
              )
            }
            title={
              keyword
                ? '没有匹配的条目'
                : tab === 'favorites'
                ? '还没有收藏任何影视'
                : '还没有观看记录'
            }
            description={
              keyword
                ? '试试其他关键词'
                : tab === 'favorites'
                ? '在播放页点击爱心即可收藏，方便下次继续观看'
                : '开始播放后，进度会自动保存到这里'
            }
            action={
              !keyword ? (
                <Link
                  href='/'
                  className='inline-flex rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600'
                >
                  去发现影视
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className='grid grid-cols-3 gap-x-2 gap-y-10 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-12'>
            {visibleItems.map((item) => {
              const selectedItem = selected.has(item.key);
              const progress = item.totalTime
                ? Math.min(
                    100,
                    Math.round(((item.playTime || 0) / item.totalTime) * 100)
                  )
                : 0;
              return (
                <div key={item.key} className='group relative'>
                  <Link
                    href={getPlayHref(item)}
                    className='block overflow-hidden rounded-xl bg-gray-200 shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg dark:bg-gray-800'
                  >
                    <div className='relative aspect-[2/3] w-full'>
                      {item.cover ? (
                        <img
                          src={processImageUrl(item.cover)}
                          alt={item.title}
                          loading='lazy'
                          className='h-full w-full object-cover'
                        />
                      ) : (
                        <div className='flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 text-gray-500 dark:from-gray-700 dark:to-gray-800'>
                          暂无海报
                        </div>
                      )}
                      <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10'>
                        <p className='line-clamp-2 text-sm font-medium text-white'>
                          {item.title}
                        </p>
                        <p className='mt-1 truncate text-xs text-white/70'>
                          {item.year} · {item.sourceName}
                        </p>
                        {tab === 'records' && (
                          <>
                            <div className='mt-2 h-1 overflow-hidden rounded-full bg-white/30'>
                              <div
                                className='h-full rounded-full bg-green-400'
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className='mt-1 text-[11px] text-white/80'>
                              第 {item.index || 1}/{item.totalEpisodes || 1} 集
                              · {formatDuration(item.playTime || 0)}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                  {selectionMode ? (
                    <button
                      onClick={() => toggleSelected(item.key)}
                      aria-label={selectedItem ? '取消选中' : '选中'}
                      className={`absolute right-2 top-2 rounded-md p-1.5 shadow ${
                        selectedItem
                          ? 'bg-green-500 text-white'
                          : 'bg-black/50 text-white/80 hover:bg-black/70'
                      }`}
                    >
                      {selectedItem ? (
                        <CheckSquare className='h-4 w-4' />
                      ) : (
                        <Square className='h-4 w-4' />
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => removeKeys([item.key])}
                      aria-label='删除'
                      className='absolute right-2 top-2 rounded-md bg-black/50 p-1.5 text-white/80 opacity-0 transition-opacity hover:bg-red-500 hover:text-white group-hover:opacity-100'
                    >
                      <Trash2 className='h-4 w-4' />
                    </button>
                  )}
                  <p className='mt-1.5 text-right text-[11px] text-gray-400 dark:text-gray-500'>
                    {formatTime(item.saveTime)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryPageClient />
    </Suspense>
  );
}
