/* eslint-disable no-console */

'use client';

/**
 * 已看剧集标记（纯浏览器本地数据）。
 *
 * 与播放记录（PlayRecord 只保存当前一集进度）不同，这里记录某一部剧
 * 所有已观看过的集数，用于在选集列表上打勾 / 一键跳到下一个未看集。
 * 使用 storageKey（source+id）作为键，与 db.client 的生成规则一致。
 */

const STORAGE_KEY = 'moontv_watched_episodes';
const UPDATE_EVENT = 'watchedEpisodesUpdated';

type WatchedMap = Record<string, number[]>;

function readAll(): WatchedMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchedMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: WatchedMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: map }));
  } catch (err) {
    console.warn('保存已看剧集失败:', err);
  }
}

export function getWatchedEpisodes(storageKey: string): number[] {
  return readAll()[storageKey] || [];
}

/** 标记某一集已看（index 为 0 基）。返回是否产生了变化。 */
export function markEpisodeWatched(storageKey: string, index: number): boolean {
  const map = readAll();
  const current = map[storageKey] || [];
  if (current.includes(index)) return false;
  map[storageKey] = [...current, index].sort((a, b) => a - b);
  writeAll(map);
  return true;
}

/** 取消某一集的已看标记。 */
export function unmarkEpisodeWatched(
  storageKey: string,
  index: number
): boolean {
  const map = readAll();
  const current = map[storageKey] || [];
  if (!current.includes(index)) return false;
  map[storageKey] = current.filter((i) => i !== index);
  writeAll(map);
  return true;
}

/** 找到第一个未看的集数（0 基），全部看完时返回 null。 */
export function getFirstUnwatchedEpisode(
  storageKey: string,
  totalEpisodes: number
): number | null {
  const watched = new Set(getWatchedEpisodes(storageKey));
  for (let i = 0; i < totalEpisodes; i++) {
    if (!watched.has(i)) return i;
  }
  return null;
}

/** 清空某部剧的已看标记。 */
export function clearWatchedEpisodes(storageKey: string): void {
  const map = readAll();
  if (!map[storageKey]) return;
  delete map[storageKey];
  writeAll(map);
}

/** 订阅已看剧集变化，返回取消订阅函数。 */
export function subscribeToWatchedUpdates(
  listener: (map: WatchedMap) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    listener((event as CustomEvent<WatchedMap>).detail);
  };
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export { UPDATE_EVENT as WATCHED_EPISODES_EVENT };
export type { WatchedMap };
