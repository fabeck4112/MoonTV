/**
 * 播放器本地设置
 *
 * 这些设置只保存在浏览器中，播放页与设置面板通过 custom event 同步。
 */

const STORAGE_KEY = 'playerSettings';
export const PLAYBACK_SETTINGS_EVENT = 'playbackSettingsUpdated';

export interface PlaybackSettings {
  /** 播放结束/临近结束时自动播放下一集 */
  autoNext: boolean;
  /** 提前多少秒切换到下一集，0 表示播完再切 */
  autoNextLeadSeconds: number;
  /** 记住音量 */
  rememberVolume: boolean;
  /** 记住倍速 */
  rememberRate: boolean;
  /** 跳过片头秒数，0 表示关闭 */
  skipIntroSeconds: number;
  /** 结尾提前多少秒视为片尾并切换下一集，0 表示关闭 */
  skipOutroSeconds: number;
  /** 启用播放器扩展快捷键 */
  shortcutsEnabled: boolean;
}

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  autoNext: true,
  autoNextLeadSeconds: 0,
  rememberVolume: true,
  rememberRate: true,
  skipIntroSeconds: 0,
  skipOutroSeconds: 0,
  shortcutsEnabled: true,
};

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function getPlaybackSettings(): PlaybackSettings {
  if (typeof window === 'undefined') return DEFAULT_PLAYBACK_SETTINGS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLAYBACK_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PlaybackSettings>;
    return {
      autoNext:
        typeof parsed.autoNext === 'boolean'
          ? parsed.autoNext
          : DEFAULT_PLAYBACK_SETTINGS.autoNext,
      autoNextLeadSeconds: clamp(
        parsed.autoNextLeadSeconds,
        0,
        30,
        DEFAULT_PLAYBACK_SETTINGS.autoNextLeadSeconds
      ),
      rememberVolume:
        typeof parsed.rememberVolume === 'boolean'
          ? parsed.rememberVolume
          : DEFAULT_PLAYBACK_SETTINGS.rememberVolume,
      rememberRate:
        typeof parsed.rememberRate === 'boolean'
          ? parsed.rememberRate
          : DEFAULT_PLAYBACK_SETTINGS.rememberRate,
      skipIntroSeconds: clamp(
        parsed.skipIntroSeconds,
        0,
        600,
        DEFAULT_PLAYBACK_SETTINGS.skipIntroSeconds
      ),
      skipOutroSeconds: clamp(
        parsed.skipOutroSeconds,
        0,
        600,
        DEFAULT_PLAYBACK_SETTINGS.skipOutroSeconds
      ),
      shortcutsEnabled:
        typeof parsed.shortcutsEnabled === 'boolean'
          ? parsed.shortcutsEnabled
          : DEFAULT_PLAYBACK_SETTINGS.shortcutsEnabled,
    };
  } catch {
    return DEFAULT_PLAYBACK_SETTINGS;
  }
}

export function savePlaybackSettings(
  patch: Partial<PlaybackSettings>
): PlaybackSettings {
  const next = { ...getPlaybackSettings(), ...patch };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent(PLAYBACK_SETTINGS_EVENT, { detail: next })
    );
  }
  return next;
}

export function resetPlaybackSettings(): PlaybackSettings {
  const next = { ...DEFAULT_PLAYBACK_SETTINGS };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent(PLAYBACK_SETTINGS_EVENT, { detail: next })
    );
  }
  return next;
}
