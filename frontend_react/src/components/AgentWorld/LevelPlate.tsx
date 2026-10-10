import React from 'react';

export type LevelPlateVariant = 'lime' | 'orange' | 'amber' | 'emerald' | 'blue' | 'purple' | 'slate';
export type LevelPlateSize = 'xs' | 'sm' | 'md';

export interface LevelPlateProps {
    level: number;
    variant?: LevelPlateVariant;
    size?: LevelPlateSize;
    className?: string;
    title?: string;
}

const variantStyles: Record<
    LevelPlateVariant,
    {
        border: string;
        tagBg: string;
        tagText: string;
        valBg: string;
        valText: string;
        shadow: string;
    }
> = {
    lime: {
        border: 'border-lime-300/80',
        tagBg: 'bg-lime-500',
        tagText: 'text-white',
        valBg: 'bg-lime-50/90',
        valText: 'text-lime-800',
        shadow: 'shadow-[0_1px_2px_rgba(101,163,13,0.12)]',
    },
    orange: {
        border: 'border-orange-300/80',
        tagBg: 'bg-orange-500',
        tagText: 'text-white',
        valBg: 'bg-orange-50/90',
        valText: 'text-orange-800',
        shadow: 'shadow-[0_1px_2px_rgba(249,115,22,0.12)]',
    },
    amber: {
        border: 'border-amber-300/80',
        tagBg: 'bg-amber-500',
        tagText: 'text-white',
        valBg: 'bg-amber-50/90',
        valText: 'text-amber-800',
        shadow: 'shadow-[0_1px_2px_rgba(245,158,11,0.12)]',
    },
    emerald: {
        border: 'border-emerald-300/80',
        tagBg: 'bg-emerald-600',
        tagText: 'text-white',
        valBg: 'bg-emerald-50/90',
        valText: 'text-emerald-800',
        shadow: 'shadow-[0_1px_2px_rgba(5,150,105,0.12)]',
    },
    blue: {
        border: 'border-sky-300/80',
        tagBg: 'bg-sky-500',
        tagText: 'text-white',
        valBg: 'bg-sky-50/90',
        valText: 'text-sky-800',
        shadow: 'shadow-[0_1px_2px_rgba(14,165,233,0.12)]',
    },
    purple: {
        border: 'border-purple-300/80',
        tagBg: 'bg-purple-500',
        tagText: 'text-white',
        valBg: 'bg-purple-50/90',
        valText: 'text-purple-800',
        shadow: 'shadow-[0_1px_2px_rgba(168,85,247,0.12)]',
    },
    slate: {
        border: 'border-slate-300/80',
        tagBg: 'bg-slate-600',
        tagText: 'text-white',
        valBg: 'bg-slate-100',
        valText: 'text-slate-800',
        shadow: 'shadow-2xs',
    },
};

const sizeStyles: Record<
    LevelPlateSize,
    {
        container: string;
        tag: string;
        val: string;
    }
> = {
    xs: {
        container: 'h-[18px] text-[9px]',
        tag: 'px-1 py-0.5 text-[8px] font-black tracking-wider',
        val: 'px-1.5 py-0.5 text-[10px] font-bold',
    },
    sm: {
        container: 'h-5 text-[10px]',
        tag: 'px-1.5 py-0.5 text-[9px] font-black tracking-wider',
        val: 'px-2 py-0.5 text-[11px] font-bold',
    },
    md: {
        container: 'h-6 text-xs',
        tag: 'px-2 py-0.5 text-[10px] font-black tracking-wider',
        val: 'px-2.5 py-0.5 text-xs font-bold',
    },
};

/**
 * 等级铭牌（LevelPlate）
 * 专为生活技能、角色等级设计的双色微铭牌，提供精致且具备游戏化仪式感的当前等级展示。
 */
export function LevelPlate({
    level,
    variant = 'lime',
    size = 'xs',
    className = '',
    title,
}: LevelPlateProps) {
    const v = variantStyles[variant] || variantStyles.lime;
    const s = sizeStyles[size] || sizeStyles.xs;

    return (
        <span
            className={`inline-flex shrink-0 items-center overflow-hidden rounded-[5px] border ${v.border} bg-white ${v.shadow} leading-none select-none ${s.container} ${className}`}
            title={title || `等级：Lv.${level}`}
        >
            <span className={`flex h-full items-center justify-center ${v.tagBg} ${v.tagText} ${s.tag}`}>
                LV
            </span>
            <span className={`flex h-full items-center justify-center font-mono tabular-nums ${v.valBg} ${v.valText} ${s.val}`}>
                {level}
            </span>
        </span>
    );
}

export default LevelPlate;
