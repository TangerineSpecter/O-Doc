export const statusName: Record<string, string> = {generating: '准备中', ready: '待开始', in_progress: '作答中', grading: '批改中', failed_grading: '批改失败', completed: '已完成', ended: '已结束', failed: '失败', pending: '等待老师处理', running: '老师处理中', draft: '作答中', cancelled: '已取消'};
export const kindName: Record<string, string> = {initial: '轻量初测', practice: '阶段练习', recap: '回归复习'};
export const cardClass = 'bg-white rounded-2xl border border-slate-200 p-6 shadow-sm';
export const buttonClass = 'rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40';
export const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100';
