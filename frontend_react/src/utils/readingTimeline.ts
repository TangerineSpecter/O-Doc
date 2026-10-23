export interface ThreadTheme {
    border: string;
    bg: string;
    text: string;
    dot: string;
    tagBg: string;
}

const THREAD_THEMES: Record<string, ThreadTheme> = {
    blue: {
        border: 'border-blue-200',
        bg: 'bg-blue-50/60',
        text: 'text-blue-700',
        dot: '#3b82f6',
        tagBg: 'bg-blue-100/70',
    },
    amber: {
        border: 'border-amber-200',
        bg: 'bg-amber-50/60',
        text: 'text-amber-700',
        dot: '#f59e0b',
        tagBg: 'bg-amber-100/70',
    },
    purple: {
        border: 'border-purple-200',
        bg: 'bg-purple-50/60',
        text: 'text-purple-700',
        dot: '#a855f7',
        tagBg: 'bg-purple-100/70',
    },
    emerald: {
        border: 'border-emerald-200',
        bg: 'bg-emerald-50/60',
        text: 'text-emerald-700',
        dot: '#10b981',
        tagBg: 'bg-emerald-100/70',
    },
    rose: {
        border: 'border-rose-200',
        bg: 'bg-rose-50/60',
        text: 'text-rose-700',
        dot: '#f43f5e',
        tagBg: 'bg-rose-100/70',
    },
    orange: {
        border: 'border-orange-200',
        bg: 'bg-orange-50/60',
        text: 'text-orange-700',
        dot: '#f97316',
        tagBg: 'bg-orange-100/70',
    },
};

const THEME_KEYS = Object.keys(THREAD_THEMES);

export function getThreadTheme(thread?: string): ThreadTheme {
    if (!thread) {
        return {
            border: 'border-slate-200',
            bg: 'bg-slate-50',
            text: 'text-slate-600',
            dot: '#94a3b8',
            tagBg: 'bg-slate-100',
        };
    }
    // 关键词优先匹配
    if (/调查|警察|案发|报案|现场|侦破/.test(thread)) return THREAD_THEMES.blue;
    if (/死者|受害|动向|行踪|失踪|被害/.test(thread)) return THREAD_THEMES.amber;
    if (/当铺|秘密|暗线|计划|疑点|交易/.test(thread)) return THREAD_THEMES.purple;
    if (/学校|同学|证人|家庭|亲属/.test(thread)) return THREAD_THEMES.emerald;

    // 字符串哈希分配
    let hash = 0;
    for (let i = 0; i < thread.length; i++) {
        hash = (hash << 5) - hash + thread.charCodeAt(i);
        hash |= 0;
    }
    const index = Math.abs(hash) % THEME_KEYS.length;
    return THREAD_THEMES[THEME_KEYS[index]];
}
