import { type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart2,
    FolderOpen,
    HeartPulse,
    Library,
    LogIn,
    LogOut,
    PenTool,
    Settings,
    Sparkles,
    StickyNote,
    Tag,
    UserRound,
    X,
    ChevronRight,
} from 'lucide-react';
import BlinkingBotIcon from './BlinkingBotIcon';
import type { UserInfo } from '../../types/api/user';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

interface MobileNavDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate?: (viewName: string, params?: any) => void;
    userInfo: UserInfo | null;
    onLogout: () => void;
    onOpenProfile: () => void;
    onOpenAI?: () => void;
}

interface NavItem {
    id: string;
    label: string;
    description: string;
    icon: typeof Sparkles;
    tone: string;
    path: string;
}

const NAV_ITEMS: NavItem[] = [
    {
        id: 'prompts',
        label: '提示词库',
        description: '高频表达与预设',
        icon: Sparkles,
        tone: 'bg-amber-50 text-amber-600 border-amber-200/80',
        path: '/prompts',
    },
    {
        id: 'memos',
        label: '闪念记录',
        description: '随时记录浮动灵感',
        icon: StickyNote,
        tone: 'bg-rose-50 text-rose-600 border-rose-200/80',
        path: '/memos',
    },
    {
        id: 'whiteboard',
        label: '灵感白板',
        description: '思维导图与无限画布',
        icon: PenTool,
        tone: 'bg-pink-50 text-pink-600 border-pink-200/80',
        path: '/whiteboard',
    },
    {
        id: 'resources',
        label: '资源库',
        description: '附件、图片与静态资产',
        icon: Library,
        tone: 'bg-sky-50 text-sky-600 border-sky-200/80',
        path: '/resources',
    },
    {
        id: 'categories',
        label: '分类管理',
        description: '知识分门别类与归档',
        icon: FolderOpen,
        tone: 'bg-orange-50 text-orange-600 border-orange-200/80',
        path: '/categories',
    },
    {
        id: 'tags',
        label: '标签管理',
        description: '穿透分类的多维标记',
        icon: Tag,
        tone: 'bg-indigo-50 text-indigo-600 border-indigo-200/80',
        path: '/tags',
    },
    {
        id: 'stats',
        label: '数据统计',
        description: '知识资产与阅读分析',
        icon: BarChart2,
        tone: 'bg-emerald-50 text-emerald-600 border-emerald-200/80',
        path: '/stats',
    },
    {
        id: 'maintenance',
        label: '知识维护',
        description: '每日回顾与健康体检',
        icon: HeartPulse,
        tone: 'bg-lime-50 text-lime-700 border-lime-200/80',
        path: '/maintenance',
    },
];

export const MobileNavDrawer: FC<MobileNavDrawerProps> = ({
    isOpen,
    onClose,
    onNavigate,
    userInfo,
    onLogout,
    onOpenProfile,
    onOpenAI,
}) => {
    const navigate = useNavigate();
    useEscapeDismissal(isOpen, onClose);

    if (!isOpen) return null;

    const handleItemClick = (item: NavItem) => {
        onClose();
        if (onNavigate) {
            onNavigate(item.id);
        } else {
            navigate(item.path);
        }
    };

    const handleOpenAiClick = () => {
        onClose();
        onOpenAI?.();
    };

    const handleProfileClick = () => {
        onClose();
        onOpenProfile();
    };

    const handleSettingsClick = () => {
        onClose();
        onNavigate?.('settings');
    };

    const handleLoginClick = () => {
        onClose();
        onNavigate?.('login');
    };

    return (
        <div className="fixed inset-0 z-[120] flex sm:hidden">
            {/* 遮罩背景 */}
            <div
                className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* 抽屉面板 */}
            <div className="relative ml-auto flex h-full w-[min(340px,86vw)] flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
                {/* 顶部标题栏 */}
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/70">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-50 border border-orange-100 shadow-sm p-0.5">
                            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                                <path d="M12 3.5V6.5" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" />
                                <circle cx="12" cy="14" r="8.5" className="fill-orange-500" />
                                <path d="M12 6.5C12 6.5 10 1 5 3C1 5 4 10 12 6.5Z" className="fill-lime-500" />
                            </svg>
                        </div>
                        <span className="font-bold text-slate-800 text-sm">功能导航</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                        aria-label="关闭菜单"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* 滚动区域 */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    {/* 用户卡片 */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                        {userInfo ? (
                            <div>
                                <div className="flex items-center gap-3">
                                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white bg-slate-200 shadow-sm">
                                        <img
                                            src={userInfo.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Visitor'}
                                            alt="User"
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="truncate text-sm font-bold text-slate-800">
                                                {userInfo.nickname || userInfo.username}
                                            </span>
                                            {userInfo.roleName && (
                                                <span className="shrink-0 rounded bg-orange-100/70 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                                                    {userInfo.roleName}
                                                </span>
                                            )}
                                        </div>
                                        <p className="truncate text-xs text-slate-400 mt-0.5">
                                            {userInfo.email || '小橘文档创作者'}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 pt-2.5 border-t border-slate-200/60 text-xs">
                                    <button
                                        type="button"
                                        onClick={handleProfileClick}
                                        className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white py-1.5 font-medium text-slate-600 shadow-sm border border-slate-200/70 hover:bg-orange-50 hover:text-orange-600"
                                    >
                                        <UserRound className="h-3.5 w-3.5" /> 个人中心
                                    </button>
                                    {userInfo.isAdmin && (
                                        <button
                                            type="button"
                                            onClick={handleSettingsClick}
                                            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white py-1.5 font-medium text-slate-600 shadow-sm border border-slate-200/70 hover:bg-slate-100"
                                        >
                                            <Settings className="h-3.5 w-3.5" /> 设置
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            onLogout();
                                        }}
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                        title="退出登录"
                                    >
                                        <LogOut className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-slate-700">访客模式</p>
                                    <p className="text-xs text-slate-400 mt-0.5">登录解锁全部功能与同步</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleLoginClick}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold shadow-sm shadow-orange-500/20 active:scale-95 transition-all"
                                >
                                    <LogIn className="h-3.5 w-3.5" /> 立即登录
                                </button>
                            </div>
                        )}
                    </div>

                    {/* AI 中心快捷卡片 */}
                    {onOpenAI && (
                        <button
                            type="button"
                            onClick={handleOpenAiClick}
                            className="group flex w-full items-center justify-between rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50/80 to-amber-50/60 p-3.5 text-left transition-all active:scale-[0.99] shadow-sm hover:border-orange-300"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm shadow-orange-500/30">
                                    <BlinkingBotIcon className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-bold text-slate-800">AI 智能体中心</span>
                                        <span className="rounded-full bg-orange-200/80 px-1.5 py-0.2 text-[10px] font-bold text-orange-800">
                                            助手
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">与小橘助手和你的智能体即刻对话</p>
                                </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-orange-400 transition-transform group-hover:translate-x-0.5" />
                        </button>
                    )}

                    {/* 工具矩阵 */}
                    <div>
                        <div className="mb-2 px-1 flex items-center justify-between text-xs font-bold text-slate-400">
                            <span>工具与功能</span>
                            <span className="text-[10px] font-mono text-slate-300">{NAV_ITEMS.length} 项</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {NAV_ITEMS.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => handleItemClick(item)}
                                        className="group flex flex-col items-start rounded-xl border border-slate-100 bg-white p-3 text-left shadow-sm transition-all hover:border-orange-200 hover:shadow active:scale-95"
                                    >
                                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${item.tone} mb-2`}>
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-800 group-hover:text-orange-600 transition-colors">
                                            {item.label}
                                        </span>
                                        <span className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
                                            {item.description}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 底部版权 */}
                <div className="border-t border-slate-100 px-5 py-3 text-center text-[11px] text-slate-400 bg-slate-50/50">
                    小橘文档 · 温暖清爽的个人知识库
                </div>
            </div>
        </div>
    );
};

export default MobileNavDrawer;
