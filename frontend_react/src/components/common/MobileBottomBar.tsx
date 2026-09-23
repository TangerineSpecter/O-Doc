import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StickyNote, Sparkles, Library, BarChart2 } from 'lucide-react';
import BlinkingBotIcon from './BlinkingBotIcon';

interface MobileBottomBarProps {
    onOpenAI: () => void;
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

export default function MobileBottomBar({ onOpenAI }: MobileBottomBarProps) {
    const location = useLocation();
    const navigate = useNavigate();

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
            className="fixed bottom-3 inset-x-3 max-w-md mx-auto z-40 sm:hidden pb-[env(safe-area-inset-bottom)]"
        >
            <div className="relative flex items-center justify-between h-[58px] px-2 bg-white/95 backdrop-blur-md rounded-full border border-slate-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                {/* 左侧两项：闪念、提示词库 */}
                <div className="flex items-center flex-1 justify-around">
                    {leftItems.map(renderButton)}
                </div>

                {/* 正中间凸起的大圆橙色 AI 按钮 */}
                <div className="relative flex flex-col items-center justify-center px-1 -mt-5 shrink-0">
                    <button
                        type="button"
                        onClick={onOpenAI}
                        className="relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/35 border-[3.5px] border-white active:scale-95 transition-transform group"
                        title="打开 AI 助手"
                        aria-label="打开 AI 助手"
                    >
                        <BlinkingBotIcon className="w-6 h-6 transition-transform group-hover:scale-110" />
                    </button>
                    <span className="text-[10px] text-orange-600 font-bold tracking-tight mt-0.5 whitespace-nowrap">
                        AI 助手
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
