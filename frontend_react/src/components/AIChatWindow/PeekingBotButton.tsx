import React, { useState, useRef, useCallback } from 'react';

interface PeekingBotButtonProps {
    onClick: () => void;
    title?: string;
    zIndexClass?: string;
    pulse?: boolean;
}

/**
 * 侧边 AI 入口抽屉按钮
 * - 桌面端：居中定位（top-1/2），悬停展示「Hi!」气泡
 * - 移动端：默认下移至安全区（bottom-28），彻底避免遮挡正文内容，并支持垂直轻量拖动防遮挡
 */
export const PeekingBotButton: React.FC<PeekingBotButtonProps> = ({
    onClick,
    title = '打开小橘 AI助手',
    zIndexClass = 'z-[80]',
    pulse = false,
}) => {
    const [dragY, setDragY] = useState<number | null>(null);
    const touchStartY = useRef(0);
    const initialTop = useRef(0);
    const isDragging = useRef(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        touchStartY.current = touch.clientY;
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            initialTop.current = rect.top;
        }
        isDragging.current = false;
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        const deltaY = touch.clientY - touchStartY.current;
        if (Math.abs(deltaY) > 6) {
            isDragging.current = true;
            const newTop = Math.max(72, Math.min(window.innerHeight - 80, initialTop.current + deltaY));
            setDragY(newTop);
        }
    }, []);

    const handleTouchEnd = useCallback(() => {
        // 轻触直接唤起，防止与拖拽冲突
        if (!isDragging.current) {
            onClick();
        }
    }, [onClick]);

    const handleClick = useCallback(() => {
        if (!isDragging.current) {
            onClick();
        }
    }, [onClick]);

    return (
        <button
            ref={buttonRef}
            type="button"
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            title={title}
            style={dragY !== null ? { top: `${dragY}px`, transform: 'none', bottom: 'auto' } : undefined}
            className={`group fixed right-0 ${
                dragY === null ? 'bottom-28 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2' : ''
            } ${zIndexClass} cursor-pointer select-none active:scale-95 transition-transform duration-150 touch-none`}
        >
            <div className="relative flex items-center bg-orange-500 hover:bg-orange-600 text-white rounded-l-md rounded-r-none border-y border-l border-orange-600/30 border-r-0 shadow-sm shadow-orange-500/20 group-hover:shadow-md group-hover:shadow-orange-500/30 transition-all duration-200 h-9 w-9 sm:group-hover:w-[78px] overflow-hidden pl-2 -mr-[1px]">
                {/* 机器人图标主体 */}
                <div className={`relative shrink-0 flex items-center justify-center w-5 h-5 ${pulse ? 'animate-pulse' : ''}`}>
                    <svg
                        className="w-4 h-4 text-white transition-transform duration-200 group-hover:scale-105"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        {/* 倒 L 型天线 */}
                        <path d="M12 8V4H8" />
                        {/* 脑袋外框 */}
                        <rect width="16" height="12" x="4" y="8" rx="3" />
                        {/* 左右小耳朵 */}
                        <path d="M2 14h2" />
                        <path d="M20 14h2" />
                        {/* 灵动眨眼眼睛 */}
                        <g className="ai-peeking-eyes">
                            <line x1="9" y1="13" x2="9" y2="15" strokeWidth="2.5" />
                            <line x1="15" y1="13" x2="15" y2="15" strokeWidth="2.5" />
                        </g>
                    </svg>
                </div>

                {/* 桌面端悬停展开的高对比纯白对话气泡 */}
                <div className="hidden sm:block relative ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                    <div className="bg-white text-orange-600 px-2 py-0.5 rounded-md text-[11px] font-black tracking-wide shadow-sm flex items-center justify-center">
                        Hi!
                    </div>
                    {/* 指向机器人的小三角气泡尾巴 */}
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[3px] border-y-transparent border-r-[4px] border-r-white" />
                </div>
            </div>
        </button>
    );
};

export default PeekingBotButton;
