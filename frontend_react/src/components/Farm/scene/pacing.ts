/** 动画节奏：纯函数，不接触 DOM，便于单测。 */
export const TICK_MS = 100; // 动物、居民等逻辑每秒 10 个 tick：状态切换、腿部帧与计时都按它推进
export const FRAME_MS = 1000 / 15; // 场景最高出帧间隔（每秒 15 帧）：tick 之间用插值把位置画得更连贯；雨天每帧都出图。CPU 与出帧率近似成正比（无头实测：10 帧≈晴天开销，20 帧约高 50%），觉得费电可改成 100
export const MAX_CATCH_UP_MS = 500; // 标签页切回前台后最多补 5 个 tick，避免瞬移

/** 累计流逝时间，取出可执行的整 tick 数；单次最多补 MAX_CATCH_UP_MS。 */
export function drainTicks(acc: number, dt: number): {acc: number; ticks: number} {
    let left = Math.min(acc + Math.max(0, dt), MAX_CATCH_UP_MS);
    const ticks = Math.floor(left / TICK_MS);
    left -= ticks * TICK_MS;
    return {acc: left, ticks};
}

/** 当前 tick 内已走过的比例 0–1，用于在上一 tick 与当前 tick 的位置之间插值。 */
export const tickAlpha = (acc: number) => Math.min(1, Math.max(0, acc / TICK_MS));

/** 线性插值。 */
export const lerp = (from: number, to: number, a: number) => from + (to - from) * a;

/** 下一帧的目标时刻：按固定间隔顺延，避免累积漂移；落后超过一个间隔时重新对齐到现在。 */
export function nextDue(due: number, now: number, interval: number): number {
    const next = due + interval;
    return next > now ? next : now + interval;
}
