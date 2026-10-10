import React from 'react';

export interface AtlasGridCardProps {
    id: string;
    name: string;
    title?: string;
    selected: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    bgGradient?: string;
    topLeftBadge?: React.ReactNode;
    topRightBadge?: React.ReactNode;
    dimmed?: boolean;
}

export function AtlasGridCard({
    name,
    title,
    selected,
    onClick,
    icon,
    bgGradient = 'from-slate-50 to-white',
    topLeftBadge,
    topRightBadge,
    dimmed = false,
}: AtlasGridCardProps) {
    return (
        <button
            type="button"
            title={title || name}
            onClick={onClick}
            aria-pressed={selected}
            className={`group relative flex h-[116px] w-[86px] shrink-0 flex-col items-center justify-start rounded-2xl border p-1.5 text-center transition-all duration-150 outline-none select-none ${
                selected
                    ? 'border-orange-400 bg-orange-50/50 shadow-xs ring-2 ring-orange-500/25'
                    : 'border-slate-200 bg-white hover:border-orange-200 hover:shadow-xs hover:bg-slate-50/30'
            } ${dimmed ? 'opacity-70 grayscale-[25%]' : ''}`}
        >
            {/* 正方形图标展示区：74x74px，带微圆角，与物品图鉴一致 */}
            <div
                className={`relative flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-gradient-to-b ${bgGradient} transition-transform duration-150 group-hover:scale-[1.03]`}
            >
                {/* 核心图标 */}
                <div className="flex h-full w-full items-center justify-center p-2">
                    {icon}
                </div>

                {/* 左上角角标 */}
                {topLeftBadge && (
                    <div className="absolute left-1 top-1 z-10 leading-none">
                        {topLeftBadge}
                    </div>
                )}

                {/* 右上角角标 */}
                {topRightBadge && (
                    <div className="absolute right-1 top-1 z-10 leading-none">
                        {topRightBadge}
                    </div>
                )}
            </div>

            {/* 实体名称：两行紧凑居中展示 */}
            <div className="mt-1.5 flex h-7 w-full items-center justify-center px-0.5">
                <span
                    className={`line-clamp-2 max-w-full break-words text-[11px] font-semibold leading-[14px] transition-colors ${
                        selected ? 'text-orange-950 font-bold' : 'text-slate-800 group-hover:text-orange-600'
                    }`}
                >
                    {name}
                </span>
            </div>
        </button>
    );
}
