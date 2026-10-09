export type RecipeState = 'unselected' | 'locked' | 'missing' | 'tired' | 'ready';

export const recipeStateLabels: Record<RecipeState, string> = {
    unselected: '请选择居民',
    locked: '等级不足',
    missing: '材料不足',
    tired: '体力不足',
    ready: '可以制作',
};

export interface RecipeStateConfig {
    label: string;
    badgeClass: string;
    dotClass: string;
}

export const recipeStateConfigs: Record<RecipeState, RecipeStateConfig> = {
    ready: {
        label: '可以制作',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
        dotClass: 'bg-emerald-500',
    },
    missing: {
        label: '材料不足',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/80',
        dotClass: 'bg-amber-500',
    },
    locked: {
        label: '等级不足',
        badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
        dotClass: 'bg-slate-400',
    },
    tired: {
        label: '体力不足',
        badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/80',
        dotClass: 'bg-sky-500',
    },
    unselected: {
        label: '请选择居民',
        badgeClass: 'bg-slate-50 text-slate-400 border-slate-200',
        dotClass: 'bg-slate-300',
    },
};
