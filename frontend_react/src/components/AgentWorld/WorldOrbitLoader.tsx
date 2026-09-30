interface WorldOrbitLoaderProps {
    /** 核心业务加载主标题，如 "正在排布居民生活日程" */
    title?: string;
    /** 阶段状态细节，如 "读取今日动态流 · 校验行动预留资金" */
    subtitle?: string;
    className?: string;
}

/**
 * 方案 3：双轨极光轻奢加载器 (Orbit Pulse Loader)
 * 采用双轨反向旋转星环、核心微光点与轻柔极光呼吸光晕，极简现代、克制高级。
 */
export default function WorldOrbitLoader({
    title = '智能体全域生活协同中',
    subtitle = '读取事件流与状态数据 · 即将呈现',
    className = '',
}: WorldOrbitLoaderProps) {
    return (
        <div
            className={`flex flex-col items-center justify-center p-6 sm:p-12 text-center select-none min-h-[340px] sm:min-h-[400px] ${className}`}
            role="status"
            aria-live="polite"
        >
            <style>{`
                @keyframes orbitClockwise {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes orbitCounterClockwise {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(-360deg); }
                }
                @keyframes auraPulse {
                    0%, 100% {
                        transform: scale(0.92);
                        opacity: 0.35;
                    }
                    50% {
                        transform: scale(1.15);
                        opacity: 0.7;
                    }
                }
                .animate-orbit-outer {
                    animation: orbitClockwise 1.25s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                }
                .animate-orbit-inner {
                    animation: orbitCounterClockwise 0.95s ease-in-out infinite;
                }
                .animate-aura-breathe {
                    animation: auraPulse 2.8s ease-in-out infinite;
                }
            `}</style>

            {/* 中央双轨星环 + 极光光晕 */}
            <div className="relative flex items-center justify-center w-28 h-28 mb-5">
                {/* 极光微光背景层 */}
                <div
                    className="animate-aura-breathe absolute inset-0 rounded-full bg-gradient-to-tr from-orange-400/25 via-amber-300/20 to-sky-400/20 blur-2xl pointer-events-none"
                    aria-hidden="true"
                />

                {/* 环体容器 */}
                <div className="relative w-12 h-12 flex items-center justify-center">
                    {/* 外轨星环 */}
                    <div className="animate-orbit-outer absolute inset-0 rounded-full border-2 border-slate-200/60 border-t-orange-500 border-r-orange-400/40" />

                    {/* 内轨星环（反向旋转） */}
                    <div className="animate-orbit-inner absolute w-7 h-7 rounded-full border-2 border-transparent border-b-amber-400 border-l-amber-300/70" />

                    {/* 核心微光脉冲点 */}
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500 shadow-sm shadow-orange-500/50" />
                    </span>
                </div>
            </div>

            {/* 状态文案区域 */}
            <div className="space-y-2 max-w-sm">
                <h4 className="text-sm font-semibold text-slate-800 tracking-tight">
                    {title}
                </h4>

                {subtitle ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50/80 border border-slate-200/70 text-[11px] text-slate-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        <span>{subtitle}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
