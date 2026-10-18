import React from 'react';

/**
 * 像素画图层数据解析器：将 ASCII 像素矩阵编译为高性能 SVG 路径
 */
function parsePixelMap(mapStr: string, palette: Record<string, string>) {
    const lines = mapStr.trim().split('\n').map(l => l.trim().split(/\s+/));
    const pathsByColor: Record<string, string[]> = {};
    lines.forEach((row, y) => {
        row.forEach((ch, x) => {
            if (ch !== '.' && palette[ch]) {
                const color = palette[ch];
                if (!pathsByColor[color]) pathsByColor[color] = [];
                pathsByColor[color].push(`M${x} ${y}h1v1h-1z`);
            }
        });
    });
    return Object.entries(pathsByColor).map(([color, paths]) => ({
        color,
        d: paths.join(''),
    }));
}

// 👑 首领王冠：16x16 经典 JRPG 复古像素金冠（带红宝石镶嵌与珍珠高光）
const BOSS_CROWN_MAP = `
. . . . . . . . . . . . . . . .
. . . . . . . W . . . . . . . .
. . . . . . # W # . . . . . . .
. . W . . . # G # . . . W . . .
. # W # . . # G # . . # W # . .
. # G # . # D G D # . # G # . .
. # G # # D G G G D # # G # . .
. # G G D G G G G G D G G # . .
. # G G G G G G G G G G G # . .
. # D G G G R R G G G G D # . .
. # D D G G K R G G D D D # . .
. # # # # # # # # # # # # # . .
. # L G G G G G G G G G D # . .
. # # # # # # # # # # # # # . .
. . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . .
`;

const BOSS_PALETTE = {
    '#': '#2A1303', // 深金褐外轮廓
    'W': '#FFFFFF', // 璀璨高光珍珠
    'L': '#FEF08A', // 亮金反光
    'G': '#FACC15', // 纯正皇家金
    'D': '#CA8A04', // 暗金阴影
    'R': '#EF4444', // 冠心红宝石
    'K': '#991B1B', // 宝石折射暗红
};

const BOSS_LAYERS = parsePixelMap(BOSS_CROWN_MAP, BOSS_PALETTE);

// ⭐ 精英星芒：16x16 像素八角紫晶圣星（带白光晶核与多层折光）
const ELITE_STAR_MAP = `
. . . . . . . . . . . . . . . .
. . . . . . . # . . . . . . . .
. . . . . . # W # . . . . . . .
. . . . . . # L # . . . . . . .
. . . . . # D P D # . . . . . .
. . . . # D P P P D # . . . . .
. . # # D P L W L P D # # . . .
. # W L P P W W W P P L D # . .
. # L P P P W W W P P P M # . .
. . # # D P L W L P M # # . . .
. . . . # D P P P M # . . . . .
. . . . . # D P M # . . . . . .
. . . . . . # P # . . . . . . .
. . . . . . # M # . . . . . . .
. . . . . . . # . . . . . . . .
. . . . . . . . . . . . . . . .
`;

const ELITE_PALETTE = {
    '#': '#2E1065', // 秘法黑紫轮廓
    'W': '#FFFFFF', // 核心晶核耀光
    'L': '#E9D5FF', // 淡紫辉光
    'P': '#A855F7', // 纯正紫晶
    'D': '#7E22CE', // 阴影紫
    'M': '#4C1D95', // 深渊暗紫
};

const ELITE_LAYERS = parsePixelMap(ELITE_STAR_MAP, ELITE_PALETTE);

// ✔ 完成探险印记：16x16 像素翡翠对勾（饱满粗笔触，高光阴影双层轮廓）
const DEFEATED_MAP = `
. . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . .
. . . . . . . . . . . . # # . .
. . . . . . . . . . . # W # . .
. . . . . . . . . . # L G # . .
. . . . . . . . . # L G # . . .
. . . . . . . . # L G D # . . .
. . . . . . . # L G D # . . . .
. . . . . . # L G D # . . . . .
. # # . . # L G D # . . . . . .
# W L # # L G D # . . . . . . .
# L G G G G D # . . . . . . . .
. # D G G D # . . . . . . . . .
. . # # # # . . . . . . . . . .
. . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . .
`;

const DEFEATED_PALETTE = {
    '#': '#064E3B', // 深墨绿外轮廓
    'W': '#FFFFFF', // 锐利高光
    'L': '#A7F3D0', // 亮薄荷绿
    'G': '#10B981', // 翡翠翠绿
    'D': '#047857', // 阴影翡翠绿
};

const DEFEATED_LAYERS = parsePixelMap(DEFEATED_MAP, DEFEATED_PALETTE);

// 迷你像素对勾印（复合在已击败 Boss/精英 角标上的 6x6 像素戳）
const MINI_CHECK_MAP = `
. . . . . #
. . . . # W
. . . # G #
# . # G # .
# W G # . .
. # # . . .
`;

const MINI_CHECK_LAYERS = parsePixelMap(MINI_CHECK_MAP, {
    '#': '#064E3B',
    'W': '#FFFFFF',
    'G': '#10B981',
});

export interface RankIconProps extends React.SVGProps<SVGSVGElement> {
    className?: string;
}

/**
 * 纯正像素首领王冠图标 (Pixel Boss Crown)
 */
export function BossCrownIcon({className = 'w-4 h-4', ...props}: RankIconProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            shapeRendering="crispEdges"
            className={`shrink-0 ${className}`}
            {...props}
        >
            {BOSS_LAYERS.map((layer, i) => (
                <path key={i} d={layer.d} fill={layer.color} />
            ))}
        </svg>
    );
}

/**
 * 纯正像素精英紫晶星图标 (Pixel Elite Star)
 */
export function EliteStarIcon({className = 'w-4 h-4', ...props}: RankIconProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            shapeRendering="crispEdges"
            className={`shrink-0 ${className}`}
            {...props}
        >
            {ELITE_LAYERS.map((layer, i) => (
                <path key={i} d={layer.d} fill={layer.color} />
            ))}
        </svg>
    );
}

/**
 * 纯正像素翡翠探索完成戳图标 (Pixel Defeated Check)
 */
export function DefeatedCheckIcon({className = 'w-4 h-4', ...props}: RankIconProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            shapeRendering="crispEdges"
            className={`shrink-0 ${className}`}
            {...props}
        >
            {DEFEATED_LAYERS.map((layer, i) => (
                <path key={i} d={layer.d} fill={layer.color} />
            ))}
        </svg>
    );
}

/**
 * 迷你像素对勾印 (6x6 像素)
 */
export function MiniPixelCheckIcon({className = 'w-2 h-2', ...props}: RankIconProps) {
    return (
        <svg
            viewBox="0 0 6 6"
            aria-hidden="true"
            shapeRendering="crispEdges"
            className={`shrink-0 ${className}`}
            {...props}
        >
            {MINI_CHECK_LAYERS.map((layer, i) => (
                <path key={i} d={layer.d} fill={layer.color} />
            ))}
        </svg>
    );
}

export type MonsterRank = 'normal' | 'elite' | 'boss';

/**
 * 像素完成 / 已击败印记（无厚重底盘，悬浮在卡片右上角）
 */
export function DefeatedBadge({
    title = '已击败',
    size = 'sm',
    className = '',
}: {
    title?: string;
    size?: 'sm' | 'md';
    className?: string;
}) {
    const sizeClasses = size === 'sm' ? 'w-[18px] h-[18px]' : 'w-5 h-5';

    return (
        <div
            className={`relative flex shrink-0 items-center justify-center filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] transition-transform duration-100 hover:scale-115 select-none ${sizeClasses} ${className}`}
            title={title}
            aria-label={title}
        >
            <DefeatedCheckIcon className="h-full w-full" />
        </div>
    );
}

/**
 * 像素精英魔物徽标（无厚重底盘，纯正复古像素紫晶星）
 */
export function EliteBadge({
    title,
    size = 'sm',
    className = '',
}: {
    isDefeated?: boolean;
    title?: string;
    size?: 'sm' | 'md';
    className?: string;
}) {
    const defaultTitle = '精英魔物';
    const finalTitle = title || defaultTitle;
    const sizeClasses = size === 'sm' ? 'w-[18px] h-[18px]' : 'w-5 h-5';

    return (
        <div
            className={`relative flex shrink-0 items-center justify-center filter drop-shadow-[0_1px_1.5px_rgba(30,10,60,0.4)] transition-transform duration-100 hover:scale-115 select-none ${sizeClasses} ${className}`}
            title={finalTitle}
            aria-label={finalTitle}
        >
            <EliteStarIcon className="h-full w-full" />
        </div>
    );
}

/**
 * 像素首领 Boss 徽标（无厚重底盘，纯正复古像素战冠）
 */
export function BossBadge({
    isBossOnly = false,
    title,
    size = 'sm',
    className = '',
}: {
    isDefeated?: boolean;
    isBossOnly?: boolean;
    title?: string;
    size?: 'sm' | 'md';
    className?: string;
}) {
    const defaultTitle = isBossOnly ? 'Boss专属' : '首领 Boss';
    const finalTitle = title || defaultTitle;
    const sizeClasses = size === 'sm' ? 'w-[19px] h-[19px]' : 'w-5 h-5';

    return (
        <div
            className={`relative flex shrink-0 items-center justify-center filter drop-shadow-[0_1px_1.5px_rgba(50,20,0,0.45)] transition-transform duration-100 hover:scale-115 select-none ${sizeClasses} ${className}`}
            title={finalTitle}
            aria-label={finalTitle}
        >
            <BossCrownIcon className="h-full w-full" />
        </div>
    );
}

export interface RankBadgeProps {
    rank?: MonsterRank | string;
    isBossOnly?: boolean;
    isDefeated?: boolean;
    title?: string;
    className?: string;
    size?: 'sm' | 'md';
}

/**
 * 图鉴卡片角标 - 统合入口，兼容旧版 RankBadge 调用
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

    if (isBoss) {
        return (
            <BossBadge
                isBossOnly={isBossOnly}
                title={title}
                size={size}
                className={className}
            />
        );
    }

    if (isElite) {
        return (
            <EliteBadge
                title={title}
                size={size}
                className={className}
            />
        );
    }

    return null;
}

/**
 * 图鉴卡片综合状态角标：仅在 Boss 或 精英 时渲染右上角像素徽章，完成状态由内框淡绿边表达
 */
export function AtlasStatusBadge({
    rank,
    isBossOnly = false,
    size = 'sm',
    className = '',
}: {
    rank?: MonsterRank | string;
    isBossOnly?: boolean;
    isDefeated?: boolean;
    size?: 'sm' | 'md';
    className?: string;
}) {
    const isBoss = rank === 'boss' || isBossOnly;
    const isElite = rank === 'elite';

    if (isBoss) {
        return <BossBadge isBossOnly={isBossOnly} size={size} className={className} />;
    }

    if (isElite) {
        return <EliteBadge size={size} className={className} />;
    }

    return null;
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
                className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900 shadow-2xs ${className}`}
            >
                <BossCrownIcon className="h-3 w-3 shrink-0" />
                <span>{children || '首领 Boss'}</span>
            </span>
        );
    }

    if (rank === 'elite') {
        return (
            <span
                className={`inline-flex items-center gap-1.5 rounded-full border border-purple-200/90 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-800 shadow-2xs ${className}`}
            >
                <EliteStarIcon className="h-3 w-3 shrink-0" />
                <span>{children || '精英魔物'}</span>
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ${className}`}
        >
            <span>{children || '普通魔物'}</span>
        </span>
    );
}


