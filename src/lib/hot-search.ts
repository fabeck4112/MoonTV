/**
 * 轻量热搜统计（Edge Runtime 兼容，纯内存）
 *
 * 与熔断器类似，这是 best-effort 的进程内统计：实例回收后数据清零。
 * 热搜只用于展示趋势，不参与任何业务逻辑，因此不需要持久化。
 */

interface HotEntry {
  keyword: string;
  count: number;
  updatedAt: number;
}

const HOT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_KEYWORDS = 200;

// Next.js 会为每个路由单独打包模块，普通模块级变量无法跨路由共享；
// 挂载到 globalThis 后，同一运行时实例内的搜索页与热搜接口可读写同一份数据。
interface HotStore {
  entries: Map<string, HotEntry>;
}
const globalStore = globalThis as typeof globalThis & {
  __moontvHotStore?: HotStore;
};
const store =
  globalStore.__moontvHotStore ||
  (globalStore.__moontvHotStore = { entries: new Map<string, HotEntry>() });
const entries = store.entries;

function normalize(keyword: string): string {
  return keyword.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function prune(): void {
  const now = Date.now();
  for (const [key, entry] of Array.from(entries.entries())) {
    if (now - entry.updatedAt > HOT_TTL_MS) {
      entries.delete(key);
    }
  }
  while (entries.size > MAX_KEYWORDS) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey === undefined) break;
    entries.delete(oldestKey);
  }
}

/** 记录一次搜索行为 */
export function recordSearch(keyword: string): void {
  const normalized = normalize(keyword);
  if (!normalized) return;

  const existing = entries.get(normalized);
  entries.set(normalized, {
    keyword: normalized,
    count: (existing?.count || 0) + 1,
    updatedAt: Date.now(),
  });
  prune();
}

export interface HotSearchItem {
  keyword: string;
  count: number;
  rank: number;
}

/** 获取热搜榜（按热度降序，其次按最近搜索时间） */
export function getHotSearches(limit = 10): HotSearchItem[] {
  prune();
  return Array.from(entries.values())
    .sort((a, b) => b.count - a.count || b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((entry, index) => ({
      keyword: entry.keyword,
      count: entry.count,
      rank: index + 1,
    }));
}
