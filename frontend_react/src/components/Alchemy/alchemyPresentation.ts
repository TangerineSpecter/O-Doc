import type {AlchemyRecipeState} from '../../types/api/alchemy';

export const alchemyStateLabels: Record<AlchemyRecipeState, string> = {
    unselected: '请选择居民', locked: '等级不足', missing: '材料不足', tired: '体力不足', ready: '可以制作',
};

export const alchemyStateConfigs: Record<AlchemyRecipeState, {label: string; badgeClass: string; dotClass: string}> = {
    ready: {label: '可以制作', badgeClass: 'bg-teal-50 text-teal-700 border-teal-200/80', dotClass: 'bg-teal-500'},
    missing: {label: '材料不足', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/80', dotClass: 'bg-amber-500'},
    locked: {label: '等级不足', badgeClass: 'bg-slate-100 text-slate-500 border-slate-200', dotClass: 'bg-slate-400'},
    tired: {label: '体力不足', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/80', dotClass: 'bg-sky-500'},
    unselected: {label: '请选择居民', badgeClass: 'bg-slate-50 text-slate-400 border-slate-200', dotClass: 'bg-slate-300'},
};

export const starLabels = ['一星', '二星', '三星', '四星', '五星'];

/** Star tiers use violet → teal, keeping gold reserved for potion values. */
export const starTierClass = [
    'border-slate-200 bg-slate-50 text-slate-600',
    'border-violet-200 bg-violet-50 text-violet-700',
    'border-violet-300 bg-violet-100 text-violet-800',
    'border-teal-200 bg-teal-50 text-teal-700',
    'border-amber-300 bg-amber-50 text-amber-700',
];

export function percent(value: number) {
    return `${Math.round(value * 1000) / 10}%`;
}

export function effectValue(effects: Record<string, number>, key: string) {
    return effects[key] ?? 0;
}
