import type {TokenFilters} from '../types/api/tokenUsage';
export const tokenNumber = (value: number | null | undefined) => value == null ? '未知' : value.toLocaleString('zh-CN');
export const purposeNames: Record<string, string> = {preview: '发帖预览', task: '任务执行', planning: '日程规划', im: 'Agent 对话', memory: '记忆整理', social: '社交决策', profile: '角色资料', learning: '学习教学'};
export const requestStatus: Record<string, string> = {running: '执行中', success: '已完成', failed: '失败', interrupted: '已中断'};
export function shanghaiDay() {
    return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
}
export function tokenDateRange(period: string, start: string, end: string): TokenFilters {
    if (period === 'all') return {all: '1'};
    if (period === 'custom') return {start_date: start, end_date: end};
    const today = shanghaiDay();
    const date = new Date(`${today}T00:00:00+08:00`);
    date.setUTCDate(date.getUTCDate() - (period === '7' ? 6 : period === '30' ? 29 : 0));
    const from = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);
    return {start_date: from, end_date: today};
}
export const usageTime = (value: string) => new Date(value).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false});
