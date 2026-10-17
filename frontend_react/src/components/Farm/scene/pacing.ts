/** 动画节奏：纯函数，不接触 DOM，便于单测。 */
export const TICK_MS = 100; // 动物、居民等逻辑每秒 10 个 tick，与设计稿一致
export const RAIN_FRAME_MS = 50; // 下雨时雨幕以每秒 25 帧按真实时间推进，其余内容仍按 tick 更新
export const MAX_CATCH_UP_MS = 500; // 标签页切回前台后最多补 5 个 tick，避免瞬移

/** 累计流逝时间，取出可执行的整 tick 数；单次最多补 MAX_CATCH_UP_MS。 */
export function drainTicks(acc: number, dt: number): {acc: number; ticks: number} {
    let left = Math.min(acc + Math.max(0, dt), MAX_CATCH_UP_MS);
    const ticks = Math.floor(left / TICK_MS);
    left -= ticks * TICK_MS;
    return {acc: left, ticks};
}

/** 当前需要的出帧间隔：下雨时按雨幕帧率，否则按 tick 间隔。 */
export const frameInterval = (rain: boolean) => rain ? RAIN_FRAME_MS : TICK_MS;

/** 下一帧的目标时刻：按固定间隔顺延，避免累积漂移；落后超过一个间隔时重新对齐到现在。 */
export function nextDue(due: number, now: number, interval: number): number {
    const next = due + interval;
    return next > now ? next : now + interval;
}
