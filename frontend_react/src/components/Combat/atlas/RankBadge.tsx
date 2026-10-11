import React from 'react';

export interface RankIconProps extends React.SVGProps<SVGSVGElement> {
    className?: string;
}

/**
 * 首领 BOSS 皇冠矢量图标
 * 挺拔三主峰与端庄冠带，带三颗璀璨顶珠与底座金环，具有游戏史诗感与威严气质
 */
export function BossCrownIcon({className = 'w-3 h-3', ...props}: RankIconProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            className={className}
            {...props}
        >
            {/* 冠身 */}
            <path d="M1.5 11.5L2.8 5.2L5.8 8L8 2.8L10.2 8L13.2 5.2L14.5 11.5H1.5Z" />
            {/* 基座底环 */}
            <rect x="2" y="12.5" width="12" height="1.8" rx="0.6" />
            {/* 顶端三颗宝珠 */}
            <circle cx="2.8" cy="4.2" r="0.9" />
            <circle cx="8" cy="1.9" r="1.1" />
            <circle cx="13.2" cy="4.2" r="0.9" />
        </svg>
    );
}

/**
 * 精英 ELITE 星芒矢量图标
 * 凌厉的八方璀璨星芒与凝聚晶核，区别于卡通五角星，展现高阶魔物的神秘力量感
 */
export function EliteStarIcon({className = 'w-3 h-3', ...props}: RankIconProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            className={className}
            {...props}
        >
            {/* 主四芒 */}
            <path d="M8 1C8 4.6 11.4 8 15 8C11.4 8 8 11.4 8 15C8 11.4 4.6 8 1 8C4.6 8 8 4.6 8 1Z" />
            {/* 辅四角 */}
            <path d="M8 4.2L9.2 6.8L11.8 8L9.2 9.2L8 11.8L6.8 9.2L4.2 8L6.8 6.8Z" opacity="0.68" />
            {/* 中心晶核高光点 */}
            <circle cx="8" cy="8" r="0.9" fill="#ffffff" />
        </svg>
    );
}

export type MonsterRank = 'normal' | 'elite' | 'boss';

export interface RankBadgeProps {
    rank?: MonsterRank | string;
    isBossOnly?: boolean;
    title?: string;
    className?: string;
    size?: 'sm' | 'md';
}

/**
 * 图鉴卡片右上角勋章
 * 替代旧版原生 emoji，采用纯矢量 SVG 与立体金属光泽圆盘
 */
export function RankBadge({
    rank,
    isBossOnly = false,
    title,
    className = '',
    size = 'sm',
}: RankBadgeProps) {
    const isBoss = rank === 'boss' || isBossOnly;
    const isElite = rank === 'elite';

    if (!isBoss && !isElite) {
        return null;
    }

    const defaultTitle = isBoss ? (isBossOnly ? 'Boss专属' : '首领 Boss') : '精英魔物';
    const finalTitle = title || defaultTitle;

    const sizeClasses = size === 'sm' ? 'w-[17px] h-[17px]' : 'w-5 h-5';
    const iconClasses = size === 'sm' ? 'w-[10.5px] h-[10.5px]' : 'w-3 h-3';

    if (isBoss) {
        return (
            <span
                className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white shadow-2xs ring-1 ring-white/90 select-none ${sizeClasses} ${className}`}
                title={finalTitle}
                aria-label={finalTitle}
            >
                <BossCrownIcon className={iconClasses} />
            </span>
        );
    }

    return (
        <span
            className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 via-purple-600 to-indigo-700 text-white shadow-2xs ring-1 ring-white/90 select-none ${sizeClasses} ${className}`}
            title={finalTitle}
            aria-label={finalTitle}
        >
            <EliteStarIcon className={iconClasses} />
        </span>
    );
}

export interface RankTagProps {
    rank?: MonsterRank | string;
    children?: React.ReactNode;
    className?: string;
}

/**
 * 详情抽屉或行内的胶囊品质标签
 */
export function RankTag({rank = 'normal', children, className = ''}: RankTagProps) {
    if (rank === 'boss') {
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ${className}`}
            >
                <BossCrownIcon className="h-2.5 w-2.5 shrink-0 text-amber-600" />
                <span>{children || '首领 Boss'}</span>
            </span>
        );
    }

    if (rank === 'elite') {
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 ${className}`}
            >
                <EliteStarIcon className="h-2.5 w-2.5 shrink-0 text-purple-600" />
                <span>{children || '精英魔物'}</span>
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ${className}`}
        >
            <span>{children || '普通魔物'}</span>
        </span>
    );
}
