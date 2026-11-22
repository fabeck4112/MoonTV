'use client';

import { FastForward, Rewind, Sun, Volume2, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const BRIGHTNESS_KEY = 'moonTV_gesture_brightness';
const LONG_PRESS_MS = 320;
const MOVE_THRESHOLD = 12;
const FAST_RATE = 3;

interface PlayerLike {
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  toggle: () => void;
}

interface PlayerGestureLayerProps {
  getPlayer: () => PlayerLike | null;
  enabled?: boolean;
}

type Mode = 'idle' | 'fast' | 'brightness' | 'volume' | 'seek';
type Side = 'left' | 'right';

interface Hint {
  kind: 'fast' | 'brightness' | 'volume' | 'seek';
  forward?: boolean;
  seconds?: number;
  current?: number;
  duration?: number;
  value?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readBrightness(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.localStorage.getItem(BRIGHTNESS_KEY);
  if (raw === null) return 1;
  const value = Number(raw);
  return Number.isFinite(value) ? clamp(value, 0, 1) : 1;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * 页面内播放器的手势层，对应大多数视频 App 的操作习惯：
 * - 长按画面：3 倍速播放，松手恢复原速
 * - 左右横滑：快进 / 快退（滑动越多跳得越远）
 * - 左侧竖滑：调亮度（浏览器无法改系统亮度，用黑色蒙层模拟）
 * - 右侧竖滑：调音量
 * - 短按画面：切换播放 / 暂停
 *
 * 该层只存在于页面 DOM 中；画中画 / 浏览器原生全屏时浏览器只渲染视频元素，
 * 叠加层不会显示，这些模式维持浏览器 / 播放器默认行为。
 */
export default function PlayerGestureLayer({
  getPlayer,
  enabled = true,
}: PlayerGestureLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef<Mode>('idle');
  const sideRef = useRef<Side>('left');
  const startRef = useRef({
    x: 0,
    y: 0,
    at: 0,
    brightness: 1,
    volume: 1,
    rate: 1,
    time: 0,
  });
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const suppressTapRef = useRef(false);
  const fastAppliedRef = useRef(false);

  const [brightness, setBrightness] = useState(1);
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    setBrightness(readBrightness());
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const flashHint = useCallback((next: Hint, autoHide = true) => {
    setHint(next);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    if (autoHide) {
      hintTimerRef.current = setTimeout(() => setHint(null), 900);
    }
  }, []);

  const restoreRate = useCallback(() => {
    if (!fastAppliedRef.current) return;
    const player = getPlayer();
    if (player) player.playbackRate = startRef.current.rate;
    fastAppliedRef.current = false;
  }, [getPlayer]);

  const startFast = useCallback(() => {
    const player = getPlayer();
    if (!player) return;
    modeRef.current = 'fast';
    startRef.current.rate = player.playbackRate;
    player.playbackRate = FAST_RATE;
    fastAppliedRef.current = true;
    flashHint({ kind: 'fast' }, false);
  }, [flashHint, getPlayer]);

  const applyBrightnessOrVolume = useCallback(
    (clientY: number) => {
      const layer = layerRef.current;
      if (!layer) return;
      const rect = layer.getBoundingClientRect();
      const delta = (startRef.current.y - clientY) / Math.max(1, rect.height);
      if (modeRef.current === 'brightness') {
        const value = clamp(startRef.current.brightness + delta, 0, 1);
        setBrightness(value);
        try {
          window.localStorage.setItem(BRIGHTNESS_KEY, String(value));
        } catch {
          /* 忽略存储失败 */
        }
        flashHint({ kind: 'brightness', value });
      } else if (modeRef.current === 'volume') {
        const player = getPlayer();
        if (!player) return;
        const value = clamp(startRef.current.volume + delta, 0, 1);
        player.volume = value;
        flashHint({ kind: 'volume', value });
      }
    },
    [flashHint, getPlayer]
  );

  const applySeek = useCallback(
    (clientX: number) => {
      const player = getPlayer();
      const layer = layerRef.current;
      if (!player || !layer) return;
      const rect = layer.getBoundingClientRect();
      const ratio = (clientX - startRef.current.x) / Math.max(1, rect.width);
      const duration = Number.isFinite(player.duration) ? player.duration : 0;
      // 横向滑过整个播放器宽度约等于跳转 90 秒
      const target = clamp(
        startRef.current.time + ratio * 90,
        0,
        duration || Number.MAX_SAFE_INTEGER
      );
      player.currentTime = target;
      flashHint({
        kind: 'seek',
        forward: ratio >= 0,
        seconds: Math.round(Math.abs(target - startRef.current.time)),
        current: target,
        duration,
      });
    },
    [flashHint, getPlayer]
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || !event.isPrimary || pointerIdRef.current !== null) return;
    const player = getPlayer();
    if (!player) return;
    clearLongPress();
    const rect = layerRef.current?.getBoundingClientRect();
    modeRef.current = 'idle';
    suppressTapRef.current = false;
    pointerIdRef.current = event.pointerId;
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      brightness: readBrightness(),
      volume: player.volume,
      rate: player.playbackRate,
      time: player.currentTime,
    };
    sideRef.current =
      rect && event.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
    longPressRef.current = setTimeout(startFast, LONG_PRESS_MS);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 某些环境不支持指针捕获，忽略 */
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (modeRef.current === 'fast') return;
    const dx = event.clientX - startRef.current.x;
    const dy = event.clientY - startRef.current.y;
    const dist = Math.hypot(dx, dy);

    if (modeRef.current === 'idle') {
      if (dist <= MOVE_THRESHOLD) return;
      clearLongPress();
      suppressTapRef.current = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        modeRef.current = 'seek';
        applySeek(event.clientX);
      } else {
        modeRef.current = sideRef.current === 'left' ? 'brightness' : 'volume';
        applyBrightnessOrVolume(event.clientY);
      }
      return;
    }

    if (modeRef.current === 'seek') applySeek(event.clientX);
    else if (modeRef.current === 'brightness' || modeRef.current === 'volume') {
      applyBrightnessOrVolume(event.clientY);
    }
  };

  const finishPointer = (
    event: React.PointerEvent<HTMLDivElement>,
    cancelled: boolean
  ) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const wasIdle = modeRef.current === 'idle';
    const elapsed = performance.now() - startRef.current.at;
    clearLongPress();
    restoreRate();
    if (
      wasIdle &&
      !suppressTapRef.current &&
      !cancelled &&
      elapsed < LONG_PRESS_MS
    ) {
      getPlayer()?.toggle();
    }
    modeRef.current = 'idle';
    suppressTapRef.current = false;
    pointerIdRef.current = null;
    if (hint?.kind === 'fast' || hint?.kind === 'seek') {
      hintTimerRef.current = setTimeout(() => setHint(null), 400);
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* 忽略 */
    }
  };

  return (
    <>
      {/* 亮度遮罩：浏览器无法修改系统亮度，用黑色蒙层模拟 */}
      <div
        className='pointer-events-none absolute inset-x-0 top-0 bottom-[100px] bg-black z-[290] transition-opacity duration-150'
        style={{ opacity: (1 - brightness) * 0.72 }}
      />

      {/* 手势接收层：避开底部控制条，右上角按钮层级更高不受影响 */}
      <div
        ref={layerRef}
        className='absolute inset-x-0 top-0 bottom-[100px] z-[300] touch-none select-none cursor-pointer'
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finishPointer(event, false)}
        onPointerCancel={(event) => finishPointer(event, true)}
        onContextMenu={(event) => event.preventDefault()}
      >
        {hint && (
          <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
            {hint.kind === 'fast' ? (
              <div className='flex items-center gap-2 rounded-2xl bg-black/70 px-6 py-4 text-2xl font-semibold text-white shadow-lg backdrop-blur-sm'>
                <Zap className='h-7 w-7 fill-yellow-400 text-yellow-400' />
                <span>{FAST_RATE}x 倍速</span>
              </div>
            ) : hint.kind === 'seek' ? (
              <div className='flex flex-col items-center gap-1.5 rounded-2xl bg-black/70 px-6 py-4 text-white shadow-lg backdrop-blur-sm'>
                <div className='flex items-center gap-3 text-3xl font-semibold'>
                  {hint.forward ? (
                    <FastForward className='h-8 w-8 fill-white' />
                  ) : (
                    <Rewind className='h-8 w-8 fill-white' />
                  )}
                  <span>
                    {hint.forward ? '+' : '-'}
                    {hint.seconds ?? 0}s
                  </span>
                </div>
                <span className='text-xs text-white/70'>
                  {formatTime(hint.current ?? 0)} /{' '}
                  {formatTime(hint.duration ?? 0)}
                </span>
              </div>
            ) : (
              <div className='flex flex-col items-center gap-2 rounded-2xl bg-black/70 px-5 py-4 text-white shadow-lg backdrop-blur-sm'>
                <div className='flex items-center gap-2 text-lg font-medium'>
                  {hint.kind === 'brightness' ? (
                    <Sun className='h-5 w-5' />
                  ) : (
                    <Volume2 className='h-5 w-5' />
                  )}
                  <span>{Math.round((hint.value ?? 0) * 100)}%</span>
                </div>
                <div className='h-1.5 w-32 overflow-hidden rounded-full bg-white/30'>
                  <div
                    className='h-full rounded-full bg-white'
                    style={{ width: `${Math.round((hint.value ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
