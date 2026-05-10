import { useEffect, useState } from 'react';
import { Search, Bell, ChevronDown, LogIn, LogOut, Settings, Leaf, ArrowUpCircle, UserRound } from 'lucide-react';
import packageJson from '../../package.json';
import NotificationPopover from '../components/NotificationPopover';
import { getNotifications } from '../api/message';
import type { UserInfo } from '../types/api/user';

interface NavbarProps {
    onNavigate?: (viewName: string, params?: any) => void;
    onOpenSearch: () => void;
    userInfo: UserInfo | null;
    onLogout: () => void;
    onOpenProfile: () => void;
}

export default function Navbar({ onNavigate, onOpenSearch, userInfo, onLogout, onOpenProfile }: NavbarProps) {
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [hasNewVersion, setHasNewVersion] = useState(false);

    // 获取未读消息数量
    useEffect(() => {
        if (!userInfo) return;
        const fetchUnread = async () => {
            try {
                const res = await getNotifications();
                // 计算未读数量
                if (Array.isArray(res)) {
                    const count = res.filter((n: any) => !n.is_read).length;
                    setUnreadCount(count);
                }
            } catch (error) {
                console.warn("Failed to fetch notifications", error);
            }
        };
        fetchUnread();
        // 简单轮询，每分钟检查一次
        const timer = setInterval(fetchUnread, 60000);
        return () => clearInterval(timer);
    }, [userInfo]);

    // 检查版本 (简化原逻辑)
    useEffect(() => {
        const checkUpdate = async () => {
            try {
                const response = await fetch('https://api.github.com/repos/TangerineSpecter/O-Doc/tags');
                if (response.ok) {
                    const tags = await response.json();
                    if (tags.length > 0) {
                        const remoteVer = tags[0].name.replace(/^v/, '');
                        if (remoteVer !== packageJson.version) setHasNewVersion(true); // 简化比较
                    }
                }
            } catch (e) { }
        };
        checkUpdate();
    }, []);

    const handleVersionClick = () => window.open('https://github.com/TangerineSpecter/O-Doc', '_blank');

    return (
        <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">

                    {/* Logo Area */}
                    <div className="flex items-center gap-3">
                        <div onClick={() => onNavigate && onNavigate('home')}
                            className="w-9 h-9 rounded-xl flex items-center justify-center bg-orange-50 border border-orange-100/50 shadow-[0_2px_8px_-2px_rgba(249,115,22,0.3)] p-0.5 overflow-hidden relative group hover:shadow-[0_4px_12px_-2px_rgba(249,115,22,0.4)] transition-shadow duration-300 cursor-pointer">
                            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
                                <path d="M12 3.5V6.5" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" />
                                <circle cx="12" cy="14" r="8.5" className="fill-orange-500" />
                                <path d="M12 6.5C12 6.5 10 1 5 3C1 5 4 10 12 6.5Z" className="fill-lime-500" />
                            </svg>
                        </div>

                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-bold tracking-tight text-slate-900">
                                小橘<span className="text-orange-600">文档</span>
                            </span>
                            <button
                                className={`group flex items-center gap-1.5 px-2 py-0.5 ml-1 rounded-[4px] shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer relative overflow-hidden ${hasNewVersion ? 'bg-orange-50 border border-orange-200 text-orange-700' : 'bg-lime-50 border border-lime-200 text-lime-800'}`}
                                onClick={handleVersionClick}
                            >
                                {hasNewVersion ? <ArrowUpCircle className="w-3 h-3 text-orange-500 animate-bounce" /> : <Leaf className="w-3 h-3 text-lime-600" />}
                                <span className="text-[11px] font-bold tracking-wide font-mono relative z-10">v{packageJson.version}</span>
                            </button>
                        </div>
                    </div>

                    {/* Right Actions */}
                    <div className="flex items-center gap-4 sm:gap-6">
                        {/* Search Bar */}
                        <div className="hidden md:flex relative group cursor-pointer" onClick={onOpenSearch}>
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                            </div>
                            <div className="pl-10 pr-4 py-2 w-72 bg-slate-100 border border-transparent rounded-full text-sm text-slate-400 group-hover:bg-white group-hover:ring-2 group-hover:ring-orange-500/50 group-hover:border-orange-500 transition-all shadow-inner flex items-center justify-between">
                                <span>搜索文档 / AI 对话...</span>
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] bg-white text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 shadow-sm">⌘K</span>
                                </div>
                            </div>
                        </div>
                        <button className="md:hidden p-2 text-slate-500 hover:text-slate-700" onClick={onOpenSearch}>
                            <Search className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                            {/* Notification Bell */}
                            <div className="relative">
                                <button
                                    onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                                    className={`p-2 transition-colors relative ${isNotificationOpen ? 'text-orange-600 bg-orange-50 rounded-full' : 'text-slate-500 hover:text-orange-600'}`}
                                >
                                    <Bell className="w-5 h-5" />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-1.5 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                                    )}
                                </button>
                                {isNotificationOpen && (
                                    <NotificationPopover
                                        onClose={() => setIsNotificationOpen(false)}
                                        onNavigate={onNavigate}
                                    />
                                )}
                            </div>

                            {/* User Dropdown */}
                            <div className="relative group z-50">
                                <div className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 rounded-full pr-3 transition-colors">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 border border-white shadow-sm overflow-hidden">
                                        <img src={userInfo?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=Visitor"} alt="User" />
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 hidden sm:block">
                                        {userInfo ? (userInfo.nickname || userInfo.username || '管理员') : '访客用户'}
                                    </span>
                                    <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:block group-hover:rotate-180 transition-transform" />
                                </div>

                                {/* Dropdown Menu */}
                                <div className="absolute right-0 top-full pt-2 w-56 hidden group-hover:block animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-2">
                                        <div className="px-3 py-2 border-b border-slate-100 mb-1">
                                            <p className="text-sm font-semibold text-slate-800">{userInfo ? '已登录' : '未登录'}</p>
                                            {userInfo && (
                                                <p className="mt-1 text-xs text-slate-500">
                                                    身份：{userInfo.roleName}
                                                </p>
                                            )}
                                        </div>
                                        {!userInfo ? (
                                            <button onClick={() => onNavigate && onNavigate('login')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-orange-50 hover:text-orange-600 rounded-lg transition-colors text-left">
                                                <LogIn className="w-4 h-4" /> 立即登录 / 注册
                                            </button>
                                        ) : (
                                            <>
                                                <button onClick={onOpenProfile} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-orange-50 hover:text-orange-600 rounded-lg transition-colors text-left">
                                                    <UserRound className="w-4 h-4" /> 个人中心
                                                </button>
                                                {userInfo.isAdmin && (
                                                    <button onClick={() => onNavigate && onNavigate('settings')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-left">
                                                        <Settings className="w-4 h-4" /> 系统设置
                                                    </button>
                                                )}
                                                <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left">
                                                    <LogOut className="w-4 h-4" /> 退出登录
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
