import React from 'react';

export interface StarLoaderProps {
    /** 加载提示文案，例如 "更新最新动态..." */
    message?: string;
    /** 尺寸规格：sm (小) | md (中，默认) | lg (大) */
    size?: 'sm' | 'md' | 'lg';
    /** 加载形态：'pill' (紧凑胶囊指示器，推荐默认) | 'orange' (品牌萌趣小橘) | 'dots' (现代晶莹律动点) | 'orbit' (双轨星环) | 'skeleton' (骨架流光屏) */
    variant?: 'pill' | 'orange' | 'dots' | 'orbit' | 'skeleton';
    /** 容器附加 class */
    className?: string;
}

/**
 * 小橘文档统一加载器组件 (StarLoader)
 * 支持紧凑胶囊指示器 (pill)、品牌萌趣小橘 (orange)、晶莹律动点 (dots)、双轨星环 (orbit) 与骨架流光 (skeleton)。
 */
export const StarLoader: React.FC<StarLoaderProps> = ({
    message,
    size = 'md',
    variant = 'pill',
    className = '',
}) => {
    return (
        <div className={`flex flex-col items-center justify-center p-3 select-none ${className}`}>
            <style>{`
                /* 胶囊微动呼吸动画 */
                @keyframes odocBreathe {
                    0%, 100% {
                        transform: scale(0.97);
                        box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.35);
                    }
                    50% {
                        transform: scale(1.03);
                        box-shadow: 0 0 0 6px rgba(249, 115, 22, 0);
                    }
                }
                .animate-odoc-breathe {
                    animation: odocBreathe 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }

                /* 品牌小橘子弹跳动效 */
                @keyframes odocOrangeBounce {
                    0%, 100% {
                        transform: translateY(0) scale(1, 1);
                    }
                    35% {
                        transform: translateY(-15px) scale(0.92, 1.08) rotate(-4deg);
                    }
                    70% {
                        transform: translateY(0) scale(1.12, 0.88);
                    }
                    85% {
                        transform: translateY(-3px) scale(0.98, 1.02);
                    }
                }
                @keyframes odocShadowScale {
                    0%, 100% {
                        transform: scale(1);
                        opacity: 0.25;
                    }
                    35% {
                        transform: scale(0.55);
                        opacity: 0.08;
                    }
                    70% {
                        transform: scale(1.15);
                        opacity: 0.35;
                    }
                }
                .animate-odoc-bounce {
                    animation: odocOrangeBounce 1.4s cubic-bezier(0.28, 0.84, 0.42, 1) infinite;
                }
                .animate-odoc-shadow {
                    animation: odocShadowScale 1.4s cubic-bezier(0.28, 0.84, 0.42, 1) infinite;
                }

                /* 晶莹律动点波浪动画 */
                @keyframes odocDotWave {
                    0%, 60%, 100% {
                        transform: translateY(0) scale(1);
                        opacity: 0.35;
                    }
                    30% {
                        transform: translateY(-8px) scale(1.18);
                        opacity: 1;
                    }
                }
                .odoc-dot-1 { animation: odocDotWave 1.2s ease-in-out infinite; }
                .odoc-dot-2 { animation: odocDotWave 1.2s ease-in-out infinite 0.15s; }
                .odoc-dot-3 { animation: odocDotWave 1.2s ease-in-out infinite 0.3s; }
                .odoc-dot-4 { animation: odocDotWave 1.2s ease-in-out infinite 0.45s; }

                /* 双轨星环旋转 */
                @keyframes odocSpinClockwise {
                    to { transform: rotate(360deg); }
                }
                @keyframes odocSpinCounter {
                    to { transform: rotate(-360deg); }
                }
                .odoc-spin-outer {
                    animation: odocSpinClockwise 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                }
                .odoc-spin-inner {
                    animation: odocSpinCounter 0.8s ease-in-out infinite;
                }

                /* 骨架屏流光效果 */
                @keyframes odocShimmerMove {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .odoc-shimmer-mask {
                    position: relative;
                    overflow: hidden;
                }
                .odoc-shimmer-mask::after {
                    position: absolute;
                    top: 0; right: 0; bottom: 0; left: 0;
                    transform: translateX(-100%);
                    background-image: linear-gradient(
                        90deg,
                        rgba(255, 255, 255, 0) 0,
                        rgba(254, 215, 170, 0.45) 50%,
                        rgba(255, 255, 255, 0) 100%
                    );
                    animation: odocShimmerMove 1.6s infinite;
                    content: '';
                }
            `}</style>

            {/* 变体 5: 紧凑胶囊指示器 (Pill Status Indicator) */}
            {variant === 'pill' && (
                <div
                    className={`inline-flex items-center gap-2.5 rounded-full border border-orange-200/90 bg-white/95 shadow-sm shadow-orange-500/10 animate-odoc-breathe ${
                        size === 'sm'
                            ? 'px-3 py-1.5 text-[11px]'
                            : size === 'lg'
                              ? 'px-5 py-2.5 text-sm'
                              : 'px-4 py-2 text-xs'
                    }`}
                >
                    <div
                        className={`rounded-full border-2 border-orange-500 border-t-transparent animate-spin shrink-0 ${
                            size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'
                        }`}
                    />
                    <span className="font-medium text-slate-700 tracking-tight">
                        {message || '更新最新动态...'}
                    </span>
                    <span
                        className={`rounded-full bg-lime-500 shrink-0 ${
                            size === 'sm' ? 'w-1 h-1' : size === 'lg' ? 'w-2 h-2' : 'w-1.5 h-1.5'
                        }`}
                    />
                </div>
            )}

            {/* 变体 1: 品牌萌趣小橘子弹动 */}
            {variant === 'orange' && (
                <div className="flex flex-col items-center justify-center">
                    <div className="relative flex flex-col items-center">
                        <div
                            className={`relative animate-odoc-bounce z-10 ${
                                size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-14 h-14' : 'w-11 h-11'
                            }`}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                className="w-full h-full drop-shadow-sm"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                            >
                                {/* 果柄 */}
                                <path
                                    d="M12 3.5V6.5"
                                    stroke="#9a3412"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                />
                                {/* 果身 */}
                                <circle cx="12" cy="14" r="8.5" fill="#f97316" />
                                {/* 果身高光点缀 */}
                                <ellipse
                                    cx="9"
                                    cy="11.5"
                                    rx="2"
                                    ry="1.2"
                                    transform="rotate(-30 9 11.5)"
                                    fill="#fdba74"
                                    opacity="0.85"
                                />
                                {/* 绿叶 */}
                                <path
                                    d="M12 6.5C12 6.5 10 1 5 3C1 5 4 10 12 6.5Z"
                                    fill="#84cc16"
                                />
                            </svg>
                        </div>
                        {/* 投影 */}
                        <div
                            className={`bg-orange-950/20 rounded-full blur-[1px] animate-odoc-shadow -mt-1 ${
                                size === 'sm' ? 'w-5 h-1.5' : size === 'lg' ? 'w-10 h-2.5' : 'w-8 h-2'
                            }`}
                        />
                    </div>
                </div>
            )}

            {/* 变体 2: 现代晶莹律动点 */}
            {variant === 'dots' && (
                <div className="flex items-center gap-2 py-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 odoc-dot-1 shadow-sm shadow-orange-500/30" />
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-400 odoc-dot-2 shadow-sm shadow-orange-500/20" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 odoc-dot-3 shadow-sm shadow-amber-400/20" />
                    <span className="w-2.5 h-2.5 rounded-full bg-lime-500 odoc-dot-4 shadow-sm shadow-lime-500/20" />
                </div>
            )}

            {/* 变体 3: 双轨轻盈星环 */}
            {variant === 'orbit' && (
                <div className="relative w-10 h-10 flex items-center justify-center my-1">
                    <div className="absolute inset-0 rounded-full border-2 border-slate-100 border-t-orange-500 odoc-spin-outer" />
                    <div className="absolute w-6 h-6 rounded-full border-2 border-transparent border-b-amber-400 odoc-spin-inner" />
                    <div className="w-2 h-2 rounded-full bg-orange-500 shadow-sm shadow-orange-500/50" />
                </div>
            )}

            {/* 变体 4: 骨架流光卡片 */}
            {variant === 'skeleton' && (
                <div className="w-full max-w-md space-y-3 px-2 py-1">
                    <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2.5 odoc-shimmer-mask">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-200/80 shrink-0" />
                            <div className="space-y-1.5 flex-1">
                                <div className="h-3 w-28 bg-slate-200/80 rounded-md" />
                                <div className="h-2 w-16 bg-slate-100 rounded-md" />
                            </div>
                            <div className="h-3 w-14 bg-slate-100 rounded-md ml-auto" />
                        </div>
                        <div className="h-2.5 w-3/4 bg-slate-200/60 rounded-md" />
                    </div>
                    <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2.5 odoc-shimmer-mask opacity-60">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-200/80 shrink-0" />
                            <div className="space-y-1.5 flex-1">
                                <div className="h-3 w-20 bg-slate-200/80 rounded-md" />
                                <div className="h-2 w-12 bg-slate-100 rounded-md" />
                            </div>
                        </div>
                        <div className="h-2.5 w-1/2 bg-slate-200/60 rounded-md" />
                    </div>
                </div>
            )}

            {/* 只有非 pill 形态且传入了 message 时，在底部渲染状态文字 */}
            {variant !== 'pill' && message && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 font-medium tracking-wide">
                    <span>{message}</span>
                    <span className="inline-flex text-orange-500 animate-pulse font-bold">···</span>
                </div>
            )}
        </div>
    );
};

export default StarLoader;