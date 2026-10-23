import React from 'react';
import {
    CircleDot,
    Droplets,
    Flame,
    GraduationCap,
    Moon,
    Mountain,
    Sun,
    Users,
    Wind,
    Sparkles,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import {formatRatio} from './presentation';

export interface ElementVisualConfig {
    key: string;
    label: string;
    fullName: string;
    Icon: React.ComponentType<{className?: string}>;
    color: string;
    iconColor: string;
    iconBg: string;
    badgeCls: string;
    pillCls: string;
    resistBg: string;
    resistLabelColor: string;
    accentBorder: string;
}

export const ELEMENT_CONFIGS: Record<string, ElementVisualConfig> = {
    water: {
        key: 'water',
        label: '水',
        fullName: '水属性',
        Icon: Droplets,
        color: 'text-sky-700',
        iconColor: 'text-sky-500',
        iconBg: 'bg-sky-50',
        badgeCls: 'bg-gradient-to-r from-sky-50 to-blue-50/70 text-sky-700 border-sky-200/80 shadow-2xs',
        pillCls: 'bg-sky-50 text-sky-700 border-sky-200/80',
        resistBg: 'bg-gradient-to-br from-sky-50/50 via-white to-sky-50/20 border-sky-100',
        resistLabelColor: 'text-sky-700',
        accentBorder: 'border-sky-300',
    },
    fire: {
        key: 'fire',
        label: '火',
        fullName: '火属性',
        Icon: Flame,
        color: 'text-rose-700',
        iconColor: 'text-rose-500',
        iconBg: 'bg-rose-50',
        badgeCls: 'bg-gradient-to-r from-rose-50 to-orange-50/70 text-rose-700 border-rose-200/80 shadow-2xs',
        pillCls: 'bg-rose-50 text-rose-700 border-rose-200/80',
        resistBg: 'bg-gradient-to-br from-rose-50/50 via-white to-rose-50/20 border-rose-100',
        resistLabelColor: 'text-rose-700',
        accentBorder: 'border-rose-300',
    },
    earth: {
        key: 'earth',
        label: '土',
        fullName: '土属性',
        Icon: Mountain,
        color: 'text-amber-800',
        iconColor: 'text-amber-600',
        iconBg: 'bg-amber-50',
        badgeCls: 'bg-gradient-to-r from-amber-50 to-yellow-50/70 text-amber-800 border-amber-200/80 shadow-2xs',
        pillCls: 'bg-amber-50 text-amber-800 border-amber-200/80',
        resistBg: 'bg-gradient-to-br from-amber-50/50 via-white to-amber-50/20 border-amber-100',
        resistLabelColor: 'text-amber-800',
        accentBorder: 'border-amber-300',
    },
    wind: {
        key: 'wind',
        label: '风',
        fullName: '风属性',
        Icon: Wind,
        color: 'text-emerald-700',
        iconColor: 'text-emerald-500',
        iconBg: 'bg-emerald-50',
        badgeCls: 'bg-gradient-to-r from-emerald-50 to-teal-50/70 text-emerald-700 border-emerald-200/80 shadow-2xs',
        pillCls: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
        resistBg: 'bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/20 border-emerald-100',
        resistLabelColor: 'text-emerald-700',
        accentBorder: 'border-emerald-300',
    },
    light: {
        key: 'light',
        label: '光',
        fullName: '光属性',
        Icon: Sun,
        color: 'text-yellow-800',
        iconColor: 'text-yellow-500',
        iconBg: 'bg-yellow-50',
        badgeCls: 'bg-gradient-to-r from-yellow-50 to-amber-50/70 text-yellow-800 border-yellow-200/80 shadow-2xs',
        pillCls: 'bg-yellow-50 text-yellow-800 border-yellow-200/80',
        resistBg: 'bg-gradient-to-br from-yellow-50/50 via-white to-yellow-50/20 border-yellow-100',
        resistLabelColor: 'text-yellow-800',
        accentBorder: 'border-yellow-300',
    },
    dark: {
        key: 'dark',
        label: '暗',
        fullName: '暗属性',
        Icon: Moon,
        color: 'text-purple-700',
        iconColor: 'text-purple-500',
        iconBg: 'bg-purple-50',
        badgeCls: 'bg-gradient-to-r from-purple-50 to-indigo-50/70 text-purple-700 border-purple-200/80 shadow-2xs',
        pillCls: 'bg-purple-50 text-purple-700 border-purple-200/80',
        resistBg: 'bg-gradient-to-br from-purple-50/50 via-white to-purple-50/20 border-purple-100',
        resistLabelColor: 'text-purple-700',
        accentBorder: 'border-purple-300',
    },
    none: {
        key: 'none',
        label: '无',
        fullName: '无属性',
        Icon: CircleDot,
        color: 'text-slate-600',
        iconColor: 'text-slate-400',
        iconBg: 'bg-slate-100',
        badgeCls: 'bg-slate-50 text-slate-600 border-slate-200/80 shadow-2xs',
        pillCls: 'bg-slate-100 text-slate-600 border-slate-200/60',
        resistBg: 'bg-gradient-to-br from-slate-50 via-white to-slate-50 border-slate-100',
        resistLabelColor: 'text-slate-600',
        accentBorder: 'border-slate-300',
    },
};

export function getElementConfig(element?: string | null): ElementVisualConfig {
    const raw = String(element || '').trim().toLowerCase();
    if (ELEMENT_CONFIGS[raw]) return ELEMENT_CONFIGS[raw];
    // 根据中文反查
    for (const cfg of Object.values(ELEMENT_CONFIGS)) {
        if (cfg.label === raw || cfg.fullName === raw) return cfg;
    }
    return ELEMENT_CONFIGS.none;
}

export interface ElementBadgeProps {
    element?: string | null;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    showIcon?: boolean;
    showSuffix?: boolean;
    className?: string;
}

/**
 * 具有 RPG 质感的精致元素属性徽章
 */
export function ElementBadge({
    element,
    size = 'sm',
    showIcon = true,
    showSuffix = true,
    className = '',
}: ElementBadgeProps) {
    const cfg = getElementConfig(element);
    const Icon = cfg.Icon;
    const text = showSuffix ? cfg.fullName : cfg.label;

    const sizeStyles = {
        xs: 'px-1.5 py-0.2 text-[9px] gap-0.5 rounded',
        sm: 'px-2 py-0.5 text-[10px] gap-1 rounded-md font-semibold',
        md: 'px-2.5 py-1 text-xs gap-1.5 rounded-lg font-semibold',
        lg: 'px-3 py-1.5 text-sm gap-2 rounded-xl font-bold',
    };

    const iconSizes = {
        xs: 'h-2.5 w-2.5',
        sm: 'h-3 w-3',
        md: 'h-3.5 w-3.5',
        lg: 'h-4 w-4',
    };

    return (
        <span
            className={`inline-flex items-center border select-none transition-all ${sizeStyles[size]} ${cfg.badgeCls} ${className}`}
            title={`元素属性：${cfg.fullName}`}
        >
            {showIcon && <Icon className={`${iconSizes[size]} shrink-0 ${cfg.iconColor}`} />}
            <span className="leading-none">{text}</span>
        </span>
    );
}

export interface ElementResistCardProps {
    element: string;
    value: number | string | null | undefined;
    className?: string;
}

/**
 * 专为魔物/属性抗性打造的精致抗性格子卡片
 * 具备弱点（负抗性）、高抗性与常规抗性视觉层次
 */
export function ElementResistCard({
    element,
    value,
    className = '',
}: ElementResistCardProps) {
    const cfg = getElementConfig(element);
    const Icon = cfg.Icon;
    const num = Number(value ?? 0);
    const isWeakness = Number.isFinite(num) && num < -0.0001;
    const isHighResist = Number.isFinite(num) && num >= 0.25;
    const isResist = Number.isFinite(num) && num > 0.0001;

    return (
        <div
            className={`relative flex flex-col justify-between rounded-xl border p-2 text-xs transition-all shadow-2xs ${
                isWeakness
                    ? 'border-rose-200/90 bg-gradient-to-br from-rose-50/70 via-white to-rose-50/30 ring-1 ring-rose-200/50'
                    : isHighResist
                      ? `${cfg.resistBg} ring-1 ring-amber-200/50`
                      : cfg.resistBg
            } ${className}`}
            title={`${cfg.label}属性抗性：${formatRatio(value)}${isWeakness ? ' (弱点克制，承受额外伤害)' : ''}`}
        >
            <div className="flex items-center justify-between gap-1">
                <dt className={`flex items-center gap-1 text-[11px] font-bold ${isWeakness ? 'text-rose-700' : cfg.resistLabelColor}`}>
                    <Icon className={`h-3 w-3 shrink-0 ${isWeakness ? 'text-rose-500' : cfg.iconColor}`} />
                    <span>{cfg.label}抗</span>
                </dt>
                {isWeakness && (
                    <span className="rounded bg-rose-100 px-1 py-0.2 text-[8px] font-black text-rose-700 leading-none shadow-2xs animate-pulse">
                        弱点
                    </span>
                )}
                {isHighResist && !isWeakness && (
                    <span className="rounded bg-amber-100/90 px-1 py-0.2 text-[8px] font-bold text-amber-800 leading-none shadow-2xs">
                        高抗
                    </span>
                )}
            </div>

            <dd className="mt-1 flex items-baseline justify-between">
                <span
                    className={`font-mono text-xs tabular-nums ${
                        isWeakness
                            ? 'font-black text-rose-600'
                            : isResist
                              ? 'font-bold text-slate-800'
                              : 'font-medium text-slate-500'
                    }`}
                >
                    {formatRatio(value)}
                </span>
                {isWeakness ? (
                    <span className="whitespace-nowrap text-[10px] text-rose-500 leading-none font-sans font-bold">增幅</span>
                ) : isResist ? (
                    <span className="text-[10px] text-slate-400 leading-none font-sans">减伤</span>
                ) : (
                    <span className="text-[10px] text-slate-400 leading-none font-sans">常规</span>
                )}
            </dd>
        </div>
    );
}

export interface EquipmentMetaSpecsProps {
    levelMin: number;
    levelMax: number;
    slot?: string;
    element?: string | null;
    allowedProfessionLabel?: string;
    professions?: string[];
    requiredMastery?: string;
    className?: string;
}

/**
 * 装备名称下方的新一代规格信息面板
 * 将 等级、属性类型、可穿职业 整合为极具设计感与游戏感的紧凑信息卡槽
 */
export function EquipmentMetaSpecs({
    levelMin,
    levelMax,
    slot,
    element,
    allowedProfessionLabel,
    professions,
    requiredMastery,
    className = '',
}: EquipmentMetaSpecsProps) {
    const isWeapon = slot === 'weapon';
    const elementCfg = getElementConfig(element);
    const ElementIcon = elementCfg.Icon;

    // 解析职业标签列表
    const parsedProfessions = React.useMemo(() => {
        if (professions && professions.length > 0) return professions;
        if (!allowedProfessionLabel) return ['全职业'];
        if (allowedProfessionLabel === '全职业') return ['全职业'];
        return allowedProfessionLabel.split(/[、,，\s]+/).filter(Boolean);
    }, [professions, allowedProfessionLabel]);

    const isAllProfessions = parsedProfessions.length >= 20 || (parsedProfessions.length === 1 && (parsedProfessions[0] === '全职业' || parsedProfessions[0] === '通用'));
    const isMultiLine = parsedProfessions.length > 4;
    const [isExpanded, setIsExpanded] = React.useState(false);

    const visibleProfessions = isExpanded || !isMultiLine
        ? parsedProfessions
        : parsedProfessions.slice(0, 4);

    return (
        <div className={`mt-2.5 w-full rounded-2xl border border-slate-100/90 bg-slate-50/70 p-2.5 space-y-2 text-left ${className}`}>
            {/* 上半部网格：等级 + (武器时的)属性类型 */}
            <div className={`grid gap-1.5 ${isWeapon ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {/* 适用装备等级卡片 */}
                <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-2.5 py-1.5 shadow-2xs">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <GraduationCap className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-medium text-slate-400 leading-none">适用等级</div>
                        <div className="mt-1 font-mono text-xs font-bold text-slate-800 leading-none">
                            Lv.{levelMin}–{levelMax}
                        </div>
                    </div>
                </div>

                {/* 武器属性类型卡片 */}
                {isWeapon && (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-2.5 py-1.5 shadow-2xs">
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${elementCfg.iconBg} ${elementCfg.iconColor}`}>
                            <ElementIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-medium text-slate-400 leading-none">属性类型</div>
                            <div className="mt-1">
                                <ElementBadge element={element} size="xs" />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 下半部：可穿职业栏（默认收起为单行） */}
            <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-white px-2.5 py-1.5 shadow-2xs">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 mt-0.5">
                    <Users className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-medium text-slate-400 leading-none">可穿职业</span>
                            {isAllProfessions && (
                                <span className="text-[10px] text-slate-400 leading-none">
                                    (共{parsedProfessions.length}个)
                                </span>
                            )}
                        </div>
                        {requiredMastery && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200/70 px-1.5 py-0.2 text-[9px] font-semibold text-amber-800 leading-none shadow-2xs">
                                <Sparkles className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                                需掌握「{requiredMastery}」
                            </span>
                        )}
                    </div>

                    {isAllProfessions ? (
                        <div className="mt-1.5 space-y-1.5">
                            <div className="flex items-center justify-between gap-1.5">
                                <span className="inline-flex items-center rounded-md border border-emerald-200/70 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 shadow-2xs">
                                    全职业通用
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                                >
                                    <span>{isExpanded ? '收起职业' : '查看明细'}</span>
                                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                            </div>
                            {isExpanded && (
                                <div className="flex flex-wrap gap-1 pt-1.5 border-t border-slate-100">
                                    {parsedProfessions.map(prof => (
                                        <span
                                            key={prof}
                                            className="inline-flex items-center rounded-md border border-slate-200/70 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-2xs"
                                        >
                                            {prof}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {visibleProfessions.map(prof => (
                                <span
                                    key={prof}
                                    className="inline-flex items-center rounded-md border border-slate-200/70 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-2xs"
                                >
                                    {prof}
                                </span>
                            ))}
                            {isMultiLine && !isExpanded && (
                                <button
                                    type="button"
                                    onClick={() => setIsExpanded(true)}
                                    className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-orange-200 bg-orange-50/50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 hover:bg-orange-100/60 transition-all shadow-2xs"
                                    title={`展开其余 ${parsedProfessions.length - 4} 个职业`}
                                >
                                    <span>+{parsedProfessions.length - 4} 更多</span>
                                    <ChevronDown className="h-2.5 w-2.5" />
                                </button>
                            )}
                            {isMultiLine && isExpanded && (
                                <button
                                    type="button"
                                    onClick={() => setIsExpanded(false)}
                                    className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-100/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-200/80 hover:text-slate-700 transition-all shadow-2xs"
                                >
                                    <span>收起</span>
                                    <ChevronUp className="h-2.5 w-2.5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
