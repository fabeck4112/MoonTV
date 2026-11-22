/**
 * 轻量失败熔断器（Edge Runtime 兼容，纯内存）
 *
 * 说明：在 Serverless / Edge 环境中进程可能随时回收，熔断状态不保证跨实例共享，
 * 但作为 best-effort 的本地保护已足够：可避免同一实例内反复请求已失效的源。
 * 状态会在实例回收后自动清零，不会影响新实例的源可用性探测。
 */

interface BreakerState {
  /** 连续失败次数 */
  failures: number;
  /** 熔断截止时间（毫秒时间戳），之前一律跳过 */
  openUntil: number;
}

const states = new Map<string, BreakerState>();

/** 连续失败多少次后触发熔断 */
const FAILURE_THRESHOLD = 3;
/** 熔断持续时间：5 分钟 */
const OPEN_DURATION_MS = 5 * 60 * 1000;

/** 该源当前是否处于熔断状态（应跳过） */
export function isCircuitOpen(key: string): boolean {
  const state = states.get(key);
  if (!state) return false;
  if (state.openUntil <= Date.now()) {
    // 熔断期结束，进入半开状态：清除记录，允许一次探测
    states.delete(key);
    return false;
  }
  return state.failures >= FAILURE_THRESHOLD;
}

/** 记录一次成功：重置该源的失败计数 */
export function recordSuccess(key: string): void {
  states.delete(key);
}

/** 记录一次失败：累加计数，达到阈值后开启熔断 */
export function recordFailure(key: string): void {
  const now = Date.now();
  const current = states.get(key);
  // 已处于熔断期则不延长，避免永久熔断
  if (
    current &&
    current.openUntil > now &&
    current.failures >= FAILURE_THRESHOLD
  ) {
    return;
  }
  const failures = (current?.failures || 0) + 1;
  states.set(key, {
    failures,
    openUntil: failures >= FAILURE_THRESHOLD ? now + OPEN_DURATION_MS : 0,
  });
}
