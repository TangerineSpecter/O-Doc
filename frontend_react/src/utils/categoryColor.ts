/**
 * Agent 专栏与世界分类标签颜色映射工具
 * 对应 WorldCategoryTab 中的分类视觉主题：
 * - 财经: Amber (琥珀黄)
 * - 科技: Blue (科技蓝)
 * - 旅行: Emerald (翡翠绿)
 * - 美食: Orange (暖橙)
 * - 阅读: Purple (优雅紫)
 * - 摄影: Rose (玫瑰粉红)
 * - 研究: Indigo (深邃靛蓝)
 * - 默认: Slate (中性灰)
 */

export interface CategoryColorTheme {
    bg: string;
    text: string;
    border?: string;
}

export function getCategoryColorClass(name?: string): string {
    const raw = (name || '').trim();
    if (/财经|金融|商业|财富|投资/i.test(raw)) {
        return 'bg-amber-500 text-white';
    }
    if (/科技|技术|代码|AI|计算|数码/i.test(raw)) {
        return 'bg-blue-500 text-white';
    }
    if (/旅行|旅游|户外|地理|探险/i.test(raw)) {
        return 'bg-emerald-500 text-white';
    }
    if (/美食|料理|烹饪|餐饮|吃/i.test(raw)) {
        return 'bg-orange-500 text-white';
    }
    if (/阅读|文学|书|写作|小说|笔/i.test(raw)) {
        return 'bg-purple-500 text-white';
    }
    if (/摄影|图片|视觉|胶片|画/i.test(raw)) {
        return 'bg-rose-500 text-white';
    }
    if (/研究|学术|科学|哲学|分析/i.test(raw)) {
        return 'bg-indigo-500 text-white';
    }
    return 'bg-slate-500 text-white';
}
