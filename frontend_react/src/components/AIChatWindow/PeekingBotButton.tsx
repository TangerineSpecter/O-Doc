import React from 'react';

interface PeekingBotButtonProps {
    onClick: () => void;
    title?: string;
    zIndexClass?: string;
    pulse?: boolean;
}

/**
 * 探头萌伴风格的侧边 AI 入口按钮（优化版）
 * - 默认状态收敛紧凑（40px），机器人完全居中，无多余留白
 * - 悬停时通过宽度纯向左展开（40px -> 88px），右边缘坚守贴壁，彻底杜绝悬停脱离断开缝隙
 * - 纯净机器人五官（无星星），内嵌脸颊微腮红与灵动眨眼
 */
export const PeekingBotButton: React.FC<PeekingBotButtonProps> = ({
    onClick,
    title = '打开小橘 AI助手',
    zIndexClass = 'z-[80]',
    pulse = false,
}) => {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`group fixed right-0 top-1/2 -translate-y-1/2 ${zIndexClass} cursor-pointer select-none active:scale-95 transition-transform duration-150`}
        >
            <div className="relative flex items-center bg-gradient-to-br from-amber-400 via-orange-500 to-orange-600 text-white rounded-l-2xl rounded-r-none border-y border-l-2 border-r-0 border-white/40 shadow-[-4px_6px_20px_rgba(249,115,22,0.35)] group-hover:shadow-[-6px_8px_25px_rgba(249,115,22,0.5)] transition-all duration-300 ease-out h-11 w-10 group-hover:w-[88px] overflow-hidden pl-2 -mr-[2px]">
                {/* 机器人头像主体（固定 24px，在 40px 默认宽度下左右各 8px 居中对齐） */}
                <div className={`relative shrink-0 flex items-center justify-center w-6 h-6 ${pulse ? 'animate-pulse' : ''}`}>
                    <svg
                        className="w-6 h-6 text-white transition-transform duration-300 group-hover:scale-105"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        {/* 倒 L 型天线 */}
                        <path d="M12 8V4H8" />
                        {/* 脑袋外框 */}
                        <rect width="16" height="12" x="4" y="8" rx="4" />
                        {/* 左右小耳朵 */}
                        <path d="M2 14h2" />
                        <path d="M20 14h2" />
                        {/* 灵动眨眼眼睛 */}
                        <g className="ai-peeking-eyes">
                            <line x1="9" y1="13" x2="9" y2="15" strokeWidth="2.5" />
                            <line x1="15" y1="13" x2="15" y2="15" strokeWidth="2.5" />
                        </g>
                        {/* 脸颊内部小腮红 */}
                        <ellipse cx="6.5" cy="16.5" rx="1.2" ry="0.6" fill="#fecdd3" stroke="none" opacity="0.9" />
                        <ellipse cx="17.5" cy="16.5" rx="1.2" ry="0.6" fill="#fecdd3" stroke="none" opacity="0.9" />
                    </svg>
                </div>

                {/* 悬停探出的打招呼微气泡（默认隐藏且透明，悬停随宽度平滑渐现） */}
                <span className="ml-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-[11px] font-bold tracking-tight whitespace-nowrap bg-white/25 backdrop-blur-sm px-2 py-0.5 rounded-full text-white shadow-sm pointer-events-none">
                    Hi!
                </span>
            </div>
        </button>
    );
};

export default PeekingBotButton;
