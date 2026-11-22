/**
 * 轻量失败熔断器（Edge Runtime 兼容，纯内存）
 *
 * 说明：在 Serverless / Edge 环境中进程可能随时回收，熔断状态不保证跨实例共享，
 * 但作为 best-effort 的本地保护已足够：可避免同一实例内反复请求已失效的源。
 * 状态会在实例回收后自动清零，不会影响新实例的源可用性探测。
 *
 * 同时记录成功率与响应时间，供「数据源健康」页面展示。
 */

interface BreakerState {
  /** 连续失败次数 */
  failures: number;
  /** 熔断截止时间（毫秒时间戳），之前一律跳过 */
  openUntil: number;
  /** 累计成功 / 失败次数 */
  successCount: number;
  failureCount: number;
  /** 最近一次活动时间戳 */
  lastSuccessAt: number;
  lastFailureAt: number;
  /** 最近一次成功响应时间（毫秒） */
  lastLatencyMs: number;
  /** 响应时间样本总和 / 数量 */
  totalLatencyMs: number;
  latencySamples: number;
}

// Next.js 按路由分别打包，模块级变量不会跨 API 路由共享；
// 使用 globalThis 让搜索接口与健康看板在同一运行时实例内看到同一份熔断状态。
const globalStore = globalThis as typeof globalThis & {
  __moontvCircuitStates?: Map<string, BreakerState>;
};
const states =
  globalStore.__moontvCircuitStates ||
  (globalStore.__moontvCircuitStates = new Map<string, BreakerState>());

/** 连续失败多少次后触发熔断 */
const FAILURE_THRESHOLD = 3;
/** 熔断持续时间：5 分钟 */
const OPEN_DURATION_MS = 5 * 60 * 1000;

function getOrCreate(key: string): BreakerState {
  const existing = states.get(key);
  if (existing) return existing;
  const created: BreakerState = {
    failures: 0,
    openUntil: 0,
    successCount: 0,
    failureCount: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    lastLatencyMs: 0,
    totalLatencyMs: 0,
    latencySamples: 0,
  };
  states.set(key, created);
  return created;
}

/** 该源当前是否处于熔断状态（应跳过） */
export function isCircuitOpen(key: string): boolean {
  const state = states.get(key);
  if (!state) return false;
  if (state.openUntil > 0 && state.openUntil <= Date.now()) {
    // 熔断期结束，进入半开状态：清除失败计数，允许一次探测
    state.failures = 0;
    state.openUntil = 0;
    return false;
  }
  return state.failures >= FAILURE_THRESHOLD;
}

/** 记录一次成功：重置连续失败计数，并累计统计信息 */
export function recordSuccess(key: string, latencyMs = 0): void {
  const state = getOrCreate(key);
  state.failures = 0;
  state.openUntil = 0;
  state.successCount += 1;
  state.lastSuccessAt = Date.now();
  if (Number.isFinite(latencyMs) && latencyMs >= 0) {
    state.lastLatencyMs = Math.round(latencyMs);
    state.totalLatencyMs += latencyMs;
    state.latencySamples += 1;
  }
}

/** 记录一次失败：累加计数，达到阈值后开启熔断 */
export function recordFailure(key: string): void {
  const now = Date.now();
  const state = getOrCreate(key);
  // 已处于熔断期则不延长，避免永久熔断
  if (state.openUntil > now && state.failures >= FAILURE_THRESHOLD) {
    return;
  }
  state.failures += 1;
  state.failureCount += 1;
  state.lastFailureAt = now;
  if (state.failures >= FAILURE_THRESHOLD) {
    state.openUntil = now + OPEN_DURATION_MS;
  }
}

export type SourceHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface SourceHealth {
  key: string;
  status: SourceHealthStatus;
  failures: number;
  successCount: number;
  failureCount: number;
  lastLatencyMs: number;
  avgLatencyMs: number;
  lastCheckedAt: number;
  openUntil: number;
  /** 排序权重：正常源优先，熔断源最后 */
  score: number;
}

/** 获取某个源的当前健康状态 */
export function getSourceHealth(key: string): SourceHealth {
  const state = states.get(key);
  const open = isCircuitOpen(key);
  const lastCheckedAt = Math.max(
    state?.lastSuccessAt || 0,
    state?.lastFailureAt || 0
  );

  let status: SourceHealthStatus = 'unknown';
  let score = 0.5;
  if (open) {
    status = 'down';
    score = -1;
  } else if ((state?.failures || 0) > 0) {
    status = 'degraded';
    score = 0;
  } else if ((state?.successCount || 0) > 0) {
    status = 'healthy';
    score = 1;
  }

  return {
    key,
    status,
    failures: state?.failures || 0,
    successCount: state?.successCount || 0,
    failureCount: state?.failureCount || 0,
    lastLatencyMs: state?.lastLatencyMs || 0,
    avgLatencyMs: state?.latencySamples
      ? Math.round(state.totalLatencyMs / state.latencySamples)
      : 0,
    lastCheckedAt,
    openUntil: open ? state?.openUntil || 0 : 0,
    score,
  };
}
