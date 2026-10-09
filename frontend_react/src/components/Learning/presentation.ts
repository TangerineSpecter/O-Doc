export const statusName: Record<string, string> = {
    generating: '准备中',
    ready: '待开始',
    in_progress: '作答中',
    grading: '批改中',
    failed_grading: '批改失败',
    completed: '已完成',
    ended: '已结束',
    failed: '失败',
    pending: '等待老师处理',
    running: '老师处理中',
    draft: '作答中',
    cancelled: '已取消',
};

export const kindName: Record<string, string> = {
    initial: '轻量初测',
    practice: '阶段练习',
    recap: '回归复习',
};

export const scenarioName: Record<string, string> = {
    travel: '旅行交流',
    work: '工作沟通',
    foundation: '基础提升',
    unsure: '推荐方向',
    dining: '餐饮点餐',
    directions: '问路交通',
    hotel: '酒店住宿',
    shopping: '购物支付',
    email: '工作邮件',
    meeting: '工作会议',
    conversation: '同事交流',
    expressions: '日常表达',
    reading: '阅读理解',
    grammar: '语法应用',
};

export const recommendationName: Record<string, string> = {
    continue: '继续推进',
    review: '巩固复习',
    adjust: '调整计划',
};

export const cardClass = 'bg-white rounded-2xl border border-slate-200 p-6 shadow-sm';
export const buttonClass = 'rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40';
export const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100';
