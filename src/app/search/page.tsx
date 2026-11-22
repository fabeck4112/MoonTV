/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any */
'use client';

import {
  ChevronDown,
  Flame,
  RotateCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';

import PageLayout from '@/components/PageLayout';
import { EmptyState, SkeletonGrid } from '@/components/UiPrimitives';
import VideoCard from '@/components/VideoCard';

interface HotItem {
  keyword: string;
  count: number;
  rank: number;
}

type TypeFilter = 'all' | 'movie' | 'tv';
type SortMode = 'relevance' | 'latest' | 'oldest' | 'title';

function SearchPageClient() {
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [hotSearches, setHotSearches] = useState<HotItem[]>([]);
  const [hotLoading, setHotLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const requestIdRef = useRef(0);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [showFilters, setShowFilters] = useState(false);

  const getDefaultAggregate = () => {
    if (typeof window !== 'undefined') {
      const userSetting = localStorage.getItem('defaultAggregateSearch');
      if (userSetting !== null) {
        return JSON.parse(userSetting);
      }
    }
    return true;
  };

  const [viewMode, setViewMode] = useState<'agg' | 'all'>(() =>
    getDefaultAggregate() ? 'agg' : 'all'
  );

  // 服务端热搜不可用时（例如本地 Edge 隔离环境），退化为本地高频搜索
  const localHotSearches = useMemo<HotItem[]>(() => {
    const counts = new Map<string, number>();
    searchHistory.forEach((item) => {
      const keyword = item.trim();
      if (keyword) counts.set(keyword, (counts.get(keyword) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([keyword, count], index) => ({
        keyword,
        count,
        rank: index + 1,
      }));
  }, [searchHistory]);

  const displayHotSearches = useMemo(
    () => (hotSearches.length > 0 ? hotSearches : localHotSearches),
    [hotSearches, localHotSearches]
  );

  const fetchHotSearches = useCallback(async () => {
    setHotLoading(true);
    try {
      const res = await fetch('/api/search/hot', { cache: 'no-store' });
      const data = await res.json();
      setHotSearches(Array.isArray(data.list) ? data.list : []);
    } catch {
      setHotSearches([]);
    } finally {
      setHotLoading(false);
    }
  }, []);

  useEffect(() => {
    !searchParams.get('q') && document.getElementById('searchInput')?.focus();

    getSearchHistory().then(setSearchHistory);
    fetchHotSearches();

    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => setSearchHistory(newHistory)
    );

    return unsubscribe;
  }, [fetchHotSearches]);

  const fetchSearchResults = async (query: string) => {
    const requestId = ++requestIdRef.current;
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (requestId !== requestIdRef.current) return;
      setSearchResults(Array.isArray(data.results) ? data.results : []);
      setTypeFilter('all');
      setYearFilter('all');
      setSourceFilter('all');
      setShowResults(true);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setSearchResults([]);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      setSearchQuery(query);
      fetchSearchResults(query);
      addSearchHistory(query);
    } else {
      setShowResults(false);
      setSearchResults([]);
    }
  }, [searchParams]);

  const handleSearch = (keyword?: string) => {
    const trimmed = (keyword ?? searchQuery).trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    setSearchQuery(trimmed);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
    setIsLoading(true);
    setShowResults(true);
    document.getElementById('searchInput')?.blur();

    if (searchParams.get('q') === trimmed) {
      fetchSearchResults(trimmed);
    } else {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
    addSearchHistory(trimmed);
    fetchHotSearches();
  };

  // 可选筛选值
  const yearOptions = useMemo(
    () =>
      Array.from(
        new Set(
          searchResults
            .map((item) => item.year)
            .filter((year) => year && year !== 'unknown')
        )
      )
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 15),
    [searchResults]
  );

  const sourceOptions = useMemo(
    () =>
      Array.from(new Set(searchResults.map((item) => item.source_name)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [searchResults]
  );

  const filteredResults = useMemo(() => {
    return searchResults.filter((item) => {
      const type = item.episodes.length > 1 ? 'tv' : 'movie';
      if (typeFilter !== 'all' && type !== typeFilter) return false;
      if (yearFilter !== 'all' && item.year !== yearFilter) return false;
      if (sourceFilter !== 'all' && item.source_name !== sourceFilter)
        return false;
      return true;
    });
  }, [searchResults, typeFilter, yearFilter, sourceFilter]);

  const compareResults = useCallback(
    (a: SearchResult, b: SearchResult) => {
      const query = searchQuery.trim();
      switch (sortMode) {
        case 'latest':
          return (b.year || '').localeCompare(a.year || '');
        case 'oldest':
          return (a.year || 'unknown').localeCompare(b.year || 'unknown');
        case 'title':
          return a.title.localeCompare(b.title, 'zh-CN');
        default: {
          const aExact = a.title === query;
          const bExact = b.title === query;
          if (aExact !== bExact) return aExact ? -1 : 1;
          const aIncludes = a.title.includes(query);
          const bIncludes = b.title.includes(query);
          if (aIncludes !== bIncludes) return aIncludes ? -1 : 1;
          return (b.year || '').localeCompare(a.year || '');
        }
      }
    },
    [searchQuery, sortMode]
  );

  const sortedResults = useMemo(
    () => [...filteredResults].sort(compareResults),
    [filteredResults, compareResults]
  );

  const aggregatedResults = useMemo(() => {
    // 规范化标题：去空格/标点、统一大小写与全半角，提升同片多源的合并率
    const normalize = (title: string) =>
      title
        .normalize('NFKC')
        .replace(/[\s·・:：\-—_()（）[\]【】]/g, '')
        .toLowerCase();

    const map = new Map<string, SearchResult[]>();
    sortedResults.forEach((item) => {
      const key = `${normalize(item.title)}-${item.year || 'unknown'}-${
        item.episodes.length === 1 ? 'movie' : 'tv'
      }`;
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    });
    // sortedResults 保留了接口按源健康度的返回顺序（稳定排序），
    // 因此组内首项即最可用源，VideoCard 取 items[0] 展示/跳转即可。
    return Array.from(map.entries());
  }, [sortedResults]);

  const suggestionPool = useMemo(() => {
    const titles = sortedResults.slice(0, 80).map((item) => item.title);
    return Array.from(
      new Set([
        ...searchHistory,
        ...displayHotSearches.map((item) => item.keyword),
        ...titles,
      ])
    );
  }, [searchHistory, displayHotSearches, sortedResults]);

  const suggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return suggestionPool
      .filter(
        (item) =>
          item.toLowerCase().includes(query) && item.toLowerCase() !== query
      )
      .slice(0, 8);
  }, [suggestionPool, searchQuery]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') handleSearch();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch(
        activeSuggestion >= 0 ? suggestions[activeSuggestion] : searchQuery
      );
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const hasFilters =
    typeFilter !== 'all' ||
    yearFilter !== 'all' ||
    sourceFilter !== 'all' ||
    sortMode !== 'relevance';

  const resetFilters = () => {
    setTypeFilter('all');
    setYearFilter('all');
    setSourceFilter('all');
    setSortMode('relevance');
  };

  const selectClass =
    'h-9 rounded-lg border border-gray-200 bg-white/90 px-2 text-sm text-gray-700 outline-none transition-colors focus:border-green-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200';

  return (
    <PageLayout activePath='/search'>
      <div className='px-4 pb-6 pt-4 sm:px-10 sm:pb-8 md:pt-16'>
        {/* 搜索框 + 联想建议 */}
        <div className='relative mx-auto mb-6 max-w-2xl'>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
          >
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
              <input
                id='searchInput'
                type='text'
                autoComplete='off'
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                  setActiveSuggestion(-1);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onKeyDown={handleInputKeyDown}
                placeholder='搜索电影、电视剧...'
                className='h-12 w-full rounded-xl border border-gray-200/70 bg-white/90 py-3 pl-10 pr-10 text-sm text-gray-800 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-green-400 focus:ring-2 focus:ring-green-400/30 dark:border-gray-700 dark:bg-gray-800/90 dark:text-gray-100 dark:placeholder:text-gray-500'
              />
              {searchQuery && (
                <button
                  type='button'
                  aria-label='清空搜索词'
                  onClick={() => {
                    setSearchQuery('');
                    setShowSuggestions(false);
                    document.getElementById('searchInput')?.focus();
                  }}
                  className='absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700'
                >
                  <X className='h-4 w-4' />
                </button>
              )}
            </div>
          </form>

          {showSuggestions && suggestions.length > 0 && (
            <ul className='absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-gray-200/80 bg-white/95 p-1 shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95'>
              {suggestions.map((item, index) => (
                <li key={item}>
                  <button
                    type='button'
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveSuggestion(index)}
                    onClick={() => handleSearch(item)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      activeSuggestion === index
                        ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Search className='h-4 w-4 shrink-0 opacity-50' />
                    <span className='truncate'>{item}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 热搜榜（无结果时展示） */}
        {!showResults && displayHotSearches.length > 0 && (
          <section className='mx-auto mb-10 max-w-5xl'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-gray-200'>
                <Flame className='h-5 w-5 text-orange-500' />
                {hotSearches.length > 0 ? '热门搜索' : '你的高频搜索'}
              </h2>
              <button
                onClick={fetchHotSearches}
                disabled={hotLoading}
                className='inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-green-600 disabled:opacity-50 dark:text-gray-400'
              >
                <RotateCw
                  className={`h-4 w-4 ${hotLoading ? 'animate-spin' : ''}`}
                />
                刷新
              </button>
            </div>
            <div className='flex flex-wrap gap-2'>
              {displayHotSearches.slice(0, 12).map((item) => (
                <button
                  key={item.keyword}
                  onClick={() => handleSearch(item.keyword)}
                  className='group inline-flex items-center gap-2 rounded-full border border-gray-200/80 bg-white/70 px-3 py-1.5 text-sm text-gray-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-400 hover:text-green-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200 dark:hover:border-green-500'
                >
                  <span
                    className={`text-xs font-bold ${
                      item.rank <= 3
                        ? 'text-orange-500'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {item.rank}
                  </span>
                  {item.keyword}
                </button>
              ))}
            </div>
          </section>
        )}

        {isLoading ? (
          <div className='mx-auto max-w-5xl'>
            <SkeletonGrid />
          </div>
        ) : showResults ? (
          <section className='mx-auto max-w-[95%]'>
            <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  搜索结果
                  <span className='ml-2 text-sm font-normal text-gray-500 dark:text-gray-400'>
                    {filteredResults.length} 条
                  </span>
                </h2>
              </div>
              <div className='flex flex-wrap items-center gap-3'>
                <button
                  onClick={() => setShowFilters((value) => !value)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors ${
                    hasFilters
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                      : 'border-gray-200 bg-white/80 text-gray-600 hover:border-green-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  <SlidersHorizontal className='h-4 w-4' />
                  筛选
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      showFilters ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <label className='flex cursor-pointer items-center gap-2 select-none'>
                  <span className='text-sm text-gray-700 dark:text-gray-300'>
                    聚合
                  </span>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={viewMode === 'agg'}
                    onChange={() =>
                      setViewMode(viewMode === 'agg' ? 'all' : 'agg')
                    }
                  />
                  <span className='relative h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-green-500 dark:bg-gray-600' />
                  <span className='absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4' />
                </label>
              </div>
            </div>

            {showFilters && (
              <div className='mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200/80 bg-white/70 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900/60'>
                <select
                  className={selectClass}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                >
                  <option value='all'>全部类型</option>
                  <option value='movie'>电影</option>
                  <option value='tv'>电视剧</option>
                </select>
                <select
                  className={selectClass}
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                >
                  <option value='all'>全部年份</option>
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClass}
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                >
                  <option value='all'>全部资源源</option>
                  {sourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClass}
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                >
                  <option value='relevance'>相关度</option>
                  <option value='latest'>年份从新到旧</option>
                  <option value='oldest'>年份从旧到新</option>
                  <option value='title'>标题排序</option>
                </select>
                {hasFilters && (
                  <button
                    onClick={resetFilters}
                    className='text-sm text-gray-500 transition-colors hover:text-red-500 dark:text-gray-400'
                  >
                    重置
                  </button>
                )}
              </div>
            )}

            {filteredResults.length === 0 ? (
              <EmptyState
                title={
                  searchResults.length ? '没有符合条件的结果' : '未找到相关结果'
                }
                description={
                  searchResults.length
                    ? '试试调整筛选条件或切换聚合模式'
                    : '换个关键词，或从热门搜索里挑一个试试'
                }
                action={
                  hasFilters ? (
                    <button
                      onClick={resetFilters}
                      className='rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600'
                    >
                      重置筛选
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div
                key={`search-results-${viewMode}-${typeFilter}-${yearFilter}-${sourceFilter}-${sortMode}`}
                className='grid grid-cols-3 justify-start gap-x-2 gap-y-14 px-0 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-20 sm:px-2'
              >
                {viewMode === 'agg'
                  ? aggregatedResults.map(([mapKey, group]) => (
                      <div key={`agg-${mapKey}`} className='w-full'>
                        <VideoCard
                          from='search'
                          items={group}
                          query={
                            searchQuery.trim() !== group[0].title
                              ? searchQuery.trim()
                              : ''
                          }
                        />
                      </div>
                    ))
                  : sortedResults.map((item) => (
                      <div
                        key={`all-${item.source}-${item.id}`}
                        className='w-full'
                      >
                        <VideoCard
                          id={item.id}
                          title={item.title}
                          poster={item.poster}
                          episodes={item.episodes.length}
                          source={item.source}
                          source_name={item.source_name}
                          douban_id={item.douban_id?.toString()}
                          query={
                            searchQuery.trim() !== item.title
                              ? searchQuery.trim()
                              : ''
                          }
                          year={item.year}
                          from='search'
                          type={item.episodes.length > 1 ? 'tv' : 'movie'}
                        />
                      </div>
                    ))}
              </div>
            )}
          </section>
        ) : searchHistory.length > 0 ? (
          <section className='mx-auto mb-10 max-w-5xl'>
            <h2 className='mb-4 text-left text-lg font-semibold text-gray-800 dark:text-gray-200'>
              搜索历史
              <button
                onClick={() => clearSearchHistory()}
                className='ml-3 text-sm text-gray-500 transition-colors hover:text-red-500 dark:text-gray-400'
              >
                清空
              </button>
            </h2>
            <div className='flex flex-wrap gap-2'>
              {searchHistory.map((item) => (
                <div key={item} className='group relative'>
                  <button
                    onClick={() => handleSearch(item)}
                    className='rounded-full bg-gray-500/10 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700/50 dark:text-gray-300 dark:hover:bg-gray-600'
                  >
                    {item}
                  </button>
                  <button
                    aria-label='删除搜索历史'
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSearchHistory(item);
                    }}
                    className='absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-400 text-[10px] text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100'
                  >
                    <X className='h-3 w-3' />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className='mx-auto max-w-5xl'>
            <EmptyState
              icon={<Search className='h-10 w-10' />}
              title='搜索你想看的影视'
              description='输入片名即可聚合搜索多个资源站，支持按类型、年份和来源筛选。'
            />
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageClient />
    </Suspense>
  );
}
