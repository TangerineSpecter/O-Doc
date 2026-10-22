const dayFormatter = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'});
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});

/** 日程统一按上海时间显示；无安排时不添加占位文字。 */
export function nextActivityLabel(value?: string | null, now = new Date()) {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const day = dayFormatter.format(date);
    const time = timeFormatter.format(date);
    const title = `下次活动计划时间：${day} ${time}（上海时间，以实际执行为准）`;
    if (date <= now) return {text: '待执行', title};
    const today = dayFormatter.format(now);
    const tomorrow = dayFormatter.format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    const prefix = day === today ? '' : day === tomorrow ? '明天 ' : `${date.toLocaleDateString('zh-CN', {timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric'})} `;
    return {text: `下次 ${prefix}${time}`, title};
}
