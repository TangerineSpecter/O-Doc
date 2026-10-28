import {useMemo, useState} from 'react';
import {
    Clock,
    Droplet,
    Heart,
    Info,
    LayoutGrid,
    List,
    Shield,
    Sparkles,
    Swords,
    Zap,
} from 'lucide-react';
import type {CookingRecipe} from '../../types/api/cooking';

interface ParsedEffectItem {
    label: string;      // 完整属性名，如 "物理攻击"、"土属性强化"
    shortLabel: string; // 紧凑简写，如 "物攻"、"土强化"，专为矩阵卡片排版
    value: string;      // 加成数值，如 "+3%"、"+6.6%"
    fullText: string;
    category: 'attack' | 'defense' | 'recovery' | 'element_power' | 'element_resist' | 'other';
    element?: string;
}

const ELEMENT_LABELS: Record<string, string> = {
    water: '水',
    fire: '火',
    earth: '土',
    wind: '风',
    light: '光',
    dark: '暗',
};

const ELEMENT_BADGES: Record<string, {bg: string; text: string; border: string}> = {
    water: {bg: 'bg-sky-50 text-sky-700 border-sky-200', text: 'text-sky-700', border: 'border-sky-200'},
    fire: {bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700', border: 'border-rose-200'},
    earth: {bg: 'bg-amber-50 text-amber-800 border-amber-200', text: 'text-amber-800', border: 'border-amber-200'},
    wind: {bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', border: 'border-emerald-200'},
    light: {bg: 'bg-yellow-50 text-yellow-800 border-yellow-200', text: 'text-yellow-800', border: 'border-yellow-200'},
    dark: {bg: 'bg-purple-50 text-purple-700 border-purple-200', text: 'text-purple-700', border: 'border-purple-200'},
};

// 预定义的基础属性字典，同时支持 snake_case 与 camelCase
const BASE_STAT_MAP: Record<string, {label: string; shortLabel: string; category: ParsedEffectItem['category']}> = {
    physical_attack: {label: '物理攻击', shortLabel: '物攻', category: 'attack'},
    physicalAttack: {label: '物理攻击', shortLabel: '物攻', category: 'attack'},
    magic_attack: {label: '魔法攻击', shortLabel: '魔攻', category: 'attack'},
    magicAttack: {label: '魔法攻击', shortLabel: '魔攻', category: 'attack'},
    physical_defense: {label: '物理防御', shortLabel: '物防', category: 'defense'},
    physicalDefense: {label: '物理防御', shortLabel: '物防', category: 'defense'},
    magic_defense: {label: '魔法防御', shortLabel: '魔防', category: 'defense'},
    magicDefense: {label: '魔法防御', shortLabel: '魔防', category: 'defense'},
    hp_recovery: {label: '每回合生命恢复', shortLabel: '生恢', category: 'recovery'},
    hpRecovery: {label: '每回合生命恢复', shortLabel: '生恢', category: 'recovery'},
    mp_recovery: {label: '每回合法力恢复', shortLabel: '法恢', category: 'recovery'},
    mpRecovery: {label: '每回合法力恢复', shortLabel: '法恢', category: 'recovery'},
};

const MULTIPLIERS = ['1.0x', '1.2x', '1.5x', '1.8x', '2.2x'];
const PROGRESS_WIDTHS = ['45%', '55%', '68%', '82%', '100%'];

function formatEffectValue(num: number): string {
    const pct = Math.round(num * 1000) / 10;
    return `+${pct}%`;
}

function parseTierEffects(
    tierEffects: Record<string, number> | undefined,
    summary: string,
): ParsedEffectItem[] {
    if (tierEffects && Object.keys(tierEffects).length > 0) {
        return Object.entries(tierEffects).map(([key, val]) => {
            // 基础属性匹配（包含 camelCase 与 snake_case）
            if (BASE_STAT_MAP[key]) {
                const conf = BASE_STAT_MAP[key];
                const valueText = conf.category === 'recovery'
                    ? `+${Math.round(val * 1000) / 10}%`
                    : formatEffectValue(val);
                return {
                    label: conf.label,
                    shortLabel: conf.shortLabel,
                    value: valueText,
                    fullText: `${conf.label} ${valueText}`,
                    category: conf.category,
                };
            }

            // 属性强化匹配（如 water_power, waterPower）
            const powerMatch = key.match(/^([a-z]+)(?:_power|Power)$/);
            if (powerMatch && ELEMENT_LABELS[powerMatch[1]]) {
                const elem = powerMatch[1];
                const elemName = ELEMENT_LABELS[elem];
                return {
                    label: `${elemName}属性强化`,
                    shortLabel: `${elemName}强化`,
                    value: formatEffectValue(val),
                    fullText: `${elemName}属性强化 ${formatEffectValue(val)}`,
                    category: 'element_power',
                    element: elem,
                };
            }

            // 属性抗性匹配（如 water_resist, waterResist）
            const resistMatch = key.match(/^([a-z]+)(?:_resist|Resist)$/);
            if (resistMatch && ELEMENT_LABELS[resistMatch[1]]) {
                const elem = resistMatch[1];
                const elemName = ELEMENT_LABELS[elem];
                return {
                    label: `${elemName}属性抗性`,
                    shortLabel: `${elemName}抗性`,
                    value: formatEffectValue(val),
                    fullText: `${elemName}属性抗性 ${formatEffectValue(val)}`,
                    category: 'element_resist',
                    element: elem,
                };
            }

            // 未知 key 兜底：尝试从 summary 中获取中文
            return {
                label: key,
                shortLabel: key.slice(0, 4),
                value: formatEffectValue(val),
                fullText: `${key} ${formatEffectValue(val)}`,
                category: 'other',
            };
        });
    }

    // Fallback: parse from summary string
    return summary.split('；').map(part => {
        const plusIdx = part.indexOf('+');
        if (plusIdx !== -1) {
            const rawLabel = part.slice(0, plusIdx).trim();
            const value = part.slice(plusIdx).replace('个百分点', '%').trim();
            let shortLabel = rawLabel;
            if (rawLabel.includes('物理攻击')) shortLabel = '物攻';
            else if (rawLabel.includes('魔法攻击')) shortLabel = '魔攻';
            else if (rawLabel.includes('物理防御')) shortLabel = '物防';
            else if (rawLabel.includes('魔法防御')) shortLabel = '魔防';
            else if (rawLabel.includes('生命')) shortLabel = '生恢';
            else if (rawLabel.includes('法力')) shortLabel = '法恢';
            else if (rawLabel.includes('强化')) shortLabel = rawLabel.replace('属性强化', '强化');
            else if (rawLabel.includes('抗性')) shortLabel = rawLabel.replace('属性抗性', '抗性');

            return {
                label: rawLabel,
                shortLabel,
                value,
                fullText: part.trim(),
                category: rawLabel.includes('攻击') ? 'attack' : rawLabel.includes('防御') ? 'defense' : 'other',
            };
        }

        // 恢复类描述格式处理，如 "每战斗回合恢复最大生命1%"
        const recoveryMatch = part.match(/恢复最大(生命|法力)(\d+(?:\.\d+)?%)/);
        if (recoveryMatch) {
            const res = recoveryMatch[1];
            const shortRes = res === '生命' ? '生恢' : '法恢';
            const pct = recoveryMatch[2];
            return {
                label: `每回合${res}恢复`,
                shortLabel: shortRes,
                value: `+${pct}`,
                fullText: part.trim(),
                category: 'recovery',
            };
        }

        return {
            label: part.trim(),
            shortLabel: part.trim().slice(0, 4),
            value: '',
            fullText: part.trim(),
            category: 'other',
        };
    });
}

function getEffectIcon(item: ParsedEffectItem) {
    if (item.category === 'attack') return <Swords className="h-3 w-3 shrink-0 text-orange-500" />;
    if (item.category === 'defense') return <Shield className="h-3 w-3 shrink-0 text-sky-500" />;
    if (item.category === 'recovery') {
        return item.label.includes('法力') ? (
            <Droplet className="h-3 w-3 shrink-0 text-indigo-500" />
        ) : (
            <Heart className="h-3 w-3 shrink-0 text-rose-500" />
        );
    }
    if (item.element && ELEMENT_BADGES[item.element]) {
        return <Sparkles className="h-3 w-3 shrink-0 text-amber-500" />;
    }
    return <Zap className="h-3 w-3 shrink-0 text-orange-400" />;
}

export default function RecipeAdventureEffects({effects}: {effects: CookingRecipe['adventureEffects']}) {
    if (!effects?.length) return null;
    return <RecipeAdventureEffectsContent effects={effects} />;
}

function RecipeAdventureEffectsContent({effects}: {effects: NonNullable<CookingRecipe['adventureEffects']>}) {
    // 是否是复杂/多属性效果（如满汉全席），若是多属性，默认阶梯列表；否则默认矩阵对比
    const isMultiEffect = useMemo(() => {
        const first = effects[0];
        return (first?.effects && Object.keys(first.effects).length > 2) || (first?.summary && first.summary.split('；').length > 2);
    }, [effects]);

    const [viewMode, setViewMode] = useState<'grid' | 'list'>(isMultiEffect ? 'list' : 'grid');

    // 解析出核心增益名称与 5 星最大值
    const maxTier = effects[effects.length - 1];
    const parsedMaxEffects = useMemo(() => {
        return parseTierEffects(maxTier?.effects, maxTier?.summary || '');
    }, [maxTier]);

    return (
        <section
            aria-label="美食冒险加成"
            className="rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50/40 via-white to-amber-50/30 p-3.5 shadow-2xs space-y-3"
        >
            {/* 顶栏：标题、标签与视图切换 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-orange-600 shadow-2xs border border-orange-200/60">
                        <Swords className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <h4 className="text-xs font-bold text-slate-800">冒险加成</h4>
                        <span className="rounded-full bg-orange-100/70 px-1.5 py-0.2 text-[10px] font-medium text-orange-700">
                            探索生效
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {/* 5星极品加成摘要徽章 */}
                    {parsedMaxEffects.length === 1 ? (
                        <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200/80 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            最高 {parsedMaxEffects[0].label}
                            <span className="font-bold font-mono text-orange-600">
                                {parsedMaxEffects[0].value}
                            </span>
                        </span>
                    ) : parsedMaxEffects.length > 1 ? (
                        <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200/80 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            {parsedMaxEffects.every(e => e.category === 'recovery')
                                ? '双重战斗恢复'
                                : parsedMaxEffects.length >= 4
                                ? '四维综合提升'
                                : '复合属性提升'}
                            <span className="font-bold font-mono text-orange-600">
                                最高 {parsedMaxEffects[0].value}
                            </span>
                        </span>
                    ) : null}

                    {/* 视图切换胶囊 */}
                    <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200/60" aria-label="展示视图切换">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-all ${
                                viewMode === 'grid'
                                    ? 'bg-white text-orange-600 shadow-2xs font-bold'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                            title="对比矩阵视图"
                        >
                            <LayoutGrid className="h-3 w-3" />
                            <span>矩阵</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-all ${
                                viewMode === 'list'
                                    ? 'bg-white text-orange-600 shadow-2xs font-bold'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                            title="阶梯列表视图"
                        >
                            <List className="h-3 w-3" />
                            <span>阶梯</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 规则速览徽章条 */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600">
                <span className="inline-flex items-center gap-1 rounded-md bg-orange-50/80 border border-orange-100 px-2 py-0.5 font-medium text-orange-700">
                    <Clock className="h-3 w-3 text-orange-500" />
                    每份30分钟 (60/120分需2/4份)
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 border border-slate-200/60 px-2 py-0.5 text-slate-600">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    限同星美食加成
                </span>
                <span className="rounded-md bg-slate-50 border border-slate-200/60 px-2 py-0.5 text-slate-500">
                    提前结束不退还
                </span>
            </div>

            {/* 星级加成核心呈现区 */}
            {viewMode === 'grid' ? (
                /* 矩阵视图：5 列并排对照 */
                <div className="space-y-1.5">
                    {/* 属性提示标头 */}
                    <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                            {getEffectIcon(parsedMaxEffects[0])}
                            {parsedMaxEffects.length === 1
                                ? `${parsedMaxEffects[0].label}增幅`
                                : parsedMaxEffects.every(e => e.category === 'recovery')
                                ? '战斗回合恢复'
                                : parsedMaxEffects.length >= 4
                                ? '四维综合增幅'
                                : '复合属性增幅'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                            基准 1.0x → 满星 2.2x
                        </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 text-center" aria-label="星级加成对比">
                        {effects.map(tier => {
                            const parsedList = parseTierEffects(tier.effects, tier.summary);
                            const isMax = tier.stars === 5;
                            return (
                                <div
                                    key={tier.stars}
                                    className={`flex flex-col justify-between rounded-xl border p-2 transition-all ${
                                        isMax
                                            ? 'border-orange-300 bg-gradient-to-b from-amber-50/80 via-white to-orange-50/70 shadow-2xs ring-1 ring-orange-200/60'
                                            : 'border-slate-100 bg-white hover:border-orange-200/70 hover:bg-orange-50/20'
                                    }`}
                                >
                                    {/* 顶部星级：金黄色星号 ★ 配合星级数字，无重复图标 */}
                                    <div className="flex items-center justify-center gap-0.5">
                                        <span className={`font-bold mr-0.5 ${isMax ? 'text-amber-500' : 'text-amber-400'}`}>
                                            ★
                                        </span>
                                        <span
                                            className={`text-xs font-bold ${
                                                isMax ? 'text-orange-950 font-extrabold' : 'text-slate-800'
                                            }`}
                                        >
                                            {tier.stars}
                                        </span>
                                        {isMax && (
                                            <span className="ml-0.5 rounded bg-gradient-to-r from-orange-500 to-amber-500 px-0.5 py-0.2 text-[8px] font-extrabold text-white leading-none">
                                                MAX
                                            </span>
                                        )}
                                    </div>

                                    {/* 中间数值展示：统一采用醒目橙色 */}
                                    <div className="my-1.5 space-y-1">
                                        {parsedList.length === 1 ? (
                                            /* 单属性居中大字号 */
                                            <div className="py-1">
                                                <span
                                                    className={`text-xs sm:text-sm font-extrabold font-mono tracking-tight ${
                                                        isMax ? 'text-orange-700' : 'text-orange-500'
                                                    }`}
                                                >
                                                    {parsedList[0].value}
                                                </span>
                                            </div>
                                        ) : (
                                            /* 多属性两端对齐紧凑列表 */
                                            parsedList.map((item, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`flex items-center justify-between text-[10px] px-1 py-0.5 rounded ${
                                                        isMax ? 'bg-orange-100/50' : 'bg-orange-50/40'
                                                    }`}
                                                >
                                                    <span className="text-slate-600 font-medium shrink-0">
                                                        {item.shortLabel}
                                                    </span>
                                                    <span
                                                        className={`font-mono font-bold shrink-0 ${
                                                            isMax ? 'text-orange-700' : 'text-orange-500'
                                                        }`}
                                                    >
                                                        {item.value}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* 底部倍率 */}
                                    <div className="border-t border-slate-100/80 pt-1 text-[9px] font-mono text-slate-400">
                                        {MULTIPLIERS[tier.stars - 1]}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                /* 阶梯列表视图：5 行渐进条带 */
                <div className="space-y-1.5" aria-label="星级加成阶梯">
                    {effects.map(tier => {
                        const parsedList = parseTierEffects(tier.effects, tier.summary);
                        const isMax = tier.stars === 5;
                        return (
                            <div
                                key={tier.stars}
                                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 transition-all ${
                                    isMax
                                        ? 'border-orange-300 bg-gradient-to-r from-orange-50/80 via-amber-50/50 to-white shadow-2xs ring-1 ring-orange-200/50'
                                        : 'border-slate-100 bg-white/90 hover:border-orange-100 hover:bg-white'
                                }`}
                            >
                                {/* 左侧：星级勋章与倍率（无重复星星图标） */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <div
                                        className={`flex items-center gap-0.5 rounded-lg px-2.5 py-0.5 text-xs font-bold ${
                                            isMax
                                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-2xs'
                                                : 'bg-amber-50 text-slate-800 border border-amber-200/70'
                                        }`}
                                    >
                                        <span className={`font-bold mr-0.5 ${isMax ? 'text-amber-200' : 'text-amber-500'}`}>
                                            ★
                                        </span>
                                        <span>{tier.stars}</span>
                                        {isMax && (
                                            <span className="ml-1 rounded bg-white/20 px-1 py-0.2 text-[8px] font-extrabold uppercase tracking-tight">
                                                MAX
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                        {MULTIPLIERS[tier.stars - 1]}
                                    </span>
                                </div>

                                {/* 中间：成长进度微条（单加成时展示） */}
                                {parsedList.length === 1 && (
                                    <div className="hidden sm:block flex-1 max-w-[100px] h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${
                                                isMax
                                                    ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                                                    : 'bg-orange-300'
                                            }`}
                                            style={{width: PROGRESS_WIDTHS[tier.stars - 1]}}
                                        />
                                    </div>
                                )}

                                {/* 右侧：加成属性胶囊 */}
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                    {parsedList.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                                                isMax
                                                    ? 'border-orange-200 bg-white text-orange-900 shadow-2xs font-semibold'
                                                    : 'border-slate-100 bg-slate-50/80 text-slate-700'
                                            }`}
                                        >
                                            {getEffectIcon(item)}
                                            <span className="text-slate-600">{item.label}</span>
                                            <span
                                                className={`font-mono font-bold ${
                                                    isMax ? 'text-orange-700 text-sm font-extrabold' : 'text-orange-600'
                                                }`}
                                            >
                                                {item.value}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 底部规则与机制贴士 */}
            <div className="flex items-start gap-1.5 rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-[10px] leading-relaxed text-slate-500">
                <Info className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                <span>
                    恢复仅在交战回合生效 · 属性强化只增强对应属性伤害，强化与抗性受战斗上限约束。
                </span>
            </div>
        </section>
    );
}
