import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StickyNote, Sparkles, Library, BarChart2 } from 'lucide-react';

interface MobileBottomBarProps {
    onOpenAI: () => void;
    isVisible?: boolean;
}

interface NavItem {
    id: string;
    label: string;
    path: string;
    icon: React.ComponentType<{ className?: string }>;
}

const leftItems: NavItem[] = [
    {
        id: 'memos',
        label: '闪念',
        path: '/memos',
        icon: StickyNote,
    },
    {
        id: 'prompts',
        label: '提示词库',
        path: '/prompts',
        icon: Sparkles,
    },
];

const rightItems: NavItem[] = [
    {
        id: 'resources',
        label: '资源库',
        path: '/resources',
        icon: Library,
    },
    {
        id: 'stats',
        label: '数据统计',
        path: '/stats',
        icon: BarChart2,
    },
];

function WorldPlanetIcon({ className = "w-6 h-6" }: { className?: string }) {
    return (
        <span className={`relative flex items-center justify-center ${className}`}>
            {/* 围绕星球旋转的微型卫星轨道 */}
            <span className="absolute -inset-[3px] animate-[spin_6s_linear_infinite] pointer-events-none">
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.9)]" />
            </span>
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-full h-full text-white drop-shadow-sm"
            >
                <circle cx="12" cy="12" r="9" />
                <ellipse cx="12" cy="12" rx="4" ry="9" />
                <path d="M3.6 9h16.8" />
                <path d="M3.6 15h16.8" />
            </svg>
        </span>
    );
}

const LONG_PRESS_DURATION = 480;

export default function MobileBottomBar({ onOpenAI, isVisible = true }: MobileBottomBarProps) {
    const location = useLocation();
    const navigate = useNavigate();

    const isWorldActive = location.pathname.startsWith('/agent-world');

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressRef = useRef(false);
    const wasMovedRef = useRef(false);
    const startCoordRef = useRef<{ x: number; y: number } | null>(null);
    const [isPressing, setIsPressing] = useState(false);

    const cancelPress = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setIsPressing(false);
    }, []);

    const startPress = useCallback((clientX: number, clientY: number) => {
        isLongPressRef.current = false;
        wasMovedRef.current = false;
        setIsPressing(true);
        startCoordRef.current = { x: clientX, y: clientY };

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            setIsPressing(false);
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try {
                    navigator.vibrate?.(40);
                } catch {
                    // ignore
                }
            }
            onOpenAI();
        }, LONG_PRESS_DURATION);
    }, [onOpenAI]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        startPress(e.clientX, e.clientY);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!startCoordRef.current || !timerRef.current) return;
        const dx = Math.abs(e.clientX - startCoordRef.current.x);
        const dy = Math.abs(e.clientY - startCoordRef.current.y);
        if (dx > 10 || dy > 10) {
            wasMovedRef.current = true;
            cancelPress();
        }
    };

    const handlePointerUp = () => {
        cancelPress();
    };

    const handlePointerCancel = () => {
        cancelPress();
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (isLongPressRef.current || wasMovedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            isLongPressRef.current = false;
            wasMovedRef.current = false;
            return;
        }
        if (location.pathname.startsWith('/agent-world')) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            navigate('/agent-world');
        }
    };

    const renderButton = (item: NavItem) => {
        const isActive = location.pathname.startsWith(item.path);
        const IconComponent = item.icon;

        return (
            <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-200 active:scale-95 ${
                    isActive
                        ? 'text-orange-600 font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                }`}
            >
                <div
                    className={`flex items-center justify-center transition-all ${
                        isActive
                            ? 'bg-orange-500 text-white w-9 h-9 rounded-2xl shadow-sm shadow-orange-500/25'
                            : 'w-7 h-7 text-slate-500'
                    }`}
                >
                    <IconComponent className={isActive ? 'w-4 h-4' : 'w-5 h-5'} />
                </div>
                <span className={`text-[10px] tracking-tight mt-0.5 whitespace-nowrap ${isActive ? 'text-orange-600 font-semibold' : 'text-slate-500'}`}>
                    {item.label}
                </span>
            </button>
        );
    };

    return (
        <nav
            aria-label="移动端底部导航"
            className={`fixed bottom-3 inset-x-3 max-w-md mx-auto z-40 sm:hidden pb-[env(safe-area-inset-bottom)] transition-all duration-300 ease-in-out ${
                isVisible === false
                    ? 'translate-y-28 opacity-0 pointer-events-none'
                    : 'translate-y-0 opacity-100'
            }`}
        >
            <div className="relative flex items-center justify-between h-[58px] px-2 bg-white/95 backdrop-blur-md rounded-full border border-slate-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                {/* 左侧两项：闪念、提示词库 */}
                <div className="flex items-center flex-1 justify-around">
                    {leftItems.map(renderButton)}
                </div>

                {/* 正中间凸起大圆：单击进入 Agent 世界，长按呼出 AI 助手 */}
                <div className="relative flex flex-col items-center justify-center px-1 -mt-5 shrink-0">
                    {/* 单独提供键盘可聚焦的 AI 入口；聚焦时显示，避免仅依赖触屏长按 */}
                    <button
                        type="button"
                        onClick={onOpenAI}
                        aria-label="打开 AI 助手"
                        className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-md focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
                    >
                        打开 AI 助手
                    </button>

                    {/* 长按充能环（橘色向内收缩 / 闭合的环形进度，480ms 充满唤起 AI 助手） */}
                    <svg className="absolute -inset-1.5 w-[68px] h-[68px] pointer-events-none -rotate-90">
                        <circle
                            cx="34"
                            cy="34"
                            r="28"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            className={`text-orange-500 transition-all ${
                                isPressing ? 'duration-[480ms] ease-linear opacity-100' : 'duration-150 ease-out opacity-0'
                            }`}
                            style={{
                                strokeDasharray: 175.9,
                                strokeDashoffset: isPressing ? 0 : 175.9,
                            }}
                        />
                    </svg>

                    <button
                        type="button"
                        onClick={handleClick}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerCancel}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
                        className={`relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-500 via-teal-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 border-[3.5px] border-white transition-all select-none touch-manipulation group ${
                            isPressing ? 'scale-90 shadow-sm' : 'active:scale-95'
                        } ${
                            isWorldActive ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white' : ''
                        }`}
                        title="单击进入 Agent 世界 · 长按唤起 AI 助手"
                        aria-label="进入 Agent 世界，长按打开 AI 助手"
                    >
                        <WorldPlanetIcon className="w-6 h-6 transition-transform group-hover:scale-110" />

                        {/* 右上角精致 AI 微标，提示用户支持长按 AI 助手 */}
                        <span
                            className="absolute -top-1 -right-1 px-1.5 py-[0.5px] rounded-full bg-orange-500 text-white text-[8px] font-extrabold shadow-sm border border-white tracking-tighter select-none pointer-events-none"
                            title="长按呼出 AI 助手"
                        >
                            AI
                        </span>
                    </button>
                    <span className={`text-[10px] tracking-tight mt-0.5 whitespace-nowrap transition-colors ${
                        isWorldActive ? 'text-emerald-600 font-bold' : 'text-slate-600 font-medium'
                    }`}>
                        Agent 世界
                    </span>
                </div>

                {/* 右侧两项：资源库、数据统计 */}
                <div className="flex items-center flex-1 justify-around">
                    {rightItems.map(renderButton)}
                </div>
            </div>
        </nav>
    );
}
