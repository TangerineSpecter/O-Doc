export const activityLabels: Record<string, string> = {unplanned: '待规划', rest: '休息', market: '市场交易', market_prepare: '每日市场机会', post_interaction: '阅读与评论', post_publish: '自主发帖', exploration: '迷宫探索', cooking: '美食制作', farm: '农场经营', travel: '旅行', investment: '股票投资'};
export const statusLabels: Record<string, string> = {pending: '待执行', running: '执行中', completed: '已完成', rest: '休息', failed: '失败', deferred: '已顺延', paused: '暂停', cancelled: '已取消'};
export const goalStatusLabels = {active: '进行中', paused: '暂停', completed: '已完成', abandoned: '已放弃'};

export interface BoardStatusMeta {
    key: string;
    label: string;
    badgeClass: string;
    dotClass: string;
    headerBg: string;
    columnBorder: string;
}

export const boardStatusColumns: BoardStatusMeta[] = [
    {
        key: 'failed',
        label: '失败',
        badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
        dotClass: 'bg-rose-500',
        headerBg: 'bg-rose-50/70 border-rose-200/80 text-rose-800',
        columnBorder: 'border-rose-200/60 bg-rose-50/15',
    },
    {
        key: 'deferred',
        label: '已顺延',
        badgeClass: 'bg-purple-100 text-purple-700 border-purple-200',
        dotClass: 'bg-purple-500',
        headerBg: 'bg-purple-50/70 border-purple-200/80 text-purple-800',
        columnBorder: 'border-purple-200/60 bg-purple-50/15',
    },
    {
        key: 'pending',
        label: '待执行',
        badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
        dotClass: 'bg-amber-500',
        headerBg: 'bg-amber-50/70 border-amber-200/80 text-amber-800',
        columnBorder: 'border-amber-200/60 bg-amber-50/15',
    },
    {
        key: 'running',
        label: '执行中',
        badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
        dotClass: 'bg-blue-500 animate-pulse',
        headerBg: 'bg-blue-50/70 border-blue-200/80 text-blue-800',
        columnBorder: 'border-blue-200/60 bg-blue-50/15',
    },
    {
        key: 'completed',
        label: '已完成',
        badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        dotClass: 'bg-emerald-500',
        headerBg: 'bg-emerald-50/70 border-emerald-200/80 text-emerald-800',
        columnBorder: 'border-emerald-200/60 bg-emerald-50/15',
    },
    {
        key: 'rest',
        label: '休息',
        badgeClass: 'bg-slate-200 text-slate-700 border-slate-300',
        dotClass: 'bg-slate-400',
        headerBg: 'bg-slate-100/70 border-slate-200/80 text-slate-700',
        columnBorder: 'border-slate-200/60 bg-slate-50/30',
    },
    {
        key: 'paused',
        label: '暂停',
        badgeClass: 'bg-slate-200 text-slate-600 border-slate-300',
        dotClass: 'bg-slate-400',
        headerBg: 'bg-slate-100/70 border-slate-200/80 text-slate-700',
        columnBorder: 'border-slate-200/60 bg-slate-50/30',
    },
    {
        key: 'cancelled',
        label: '已取消',
        badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
        dotClass: 'bg-slate-300',
        headerBg: 'bg-slate-50 border-slate-200/60 text-slate-500',
        columnBorder: 'border-slate-200/50 bg-slate-50/10',
    },
];

// 按世界货币消费能力展示；旧记录有真实支出时仍保留财务信息。
export function showsLifeBudget(item: {activity: string; spent: string}): boolean {
    return ['travel', 'farm', 'market', 'market_prepare', 'investment'].includes(item.activity)
        || Number(item.spent) > 0;
}

