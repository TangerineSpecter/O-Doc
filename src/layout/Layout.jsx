import React, { useState, useEffect, useRef } from 'react';
import {
    Search,
    Bell,
    ChevronDown,
    BookOpen,
    LogIn,
    Settings,
    Hash,
    CornerDownLeft,
    ArrowUpDown,
    Clock,
    FileText,
    Leaf // 确保引入了 Leaf 图标
} from 'lucide-react';
import packageJson from '../../package.json';

// Search Suggestion Data (Layout specific data)
const searchSuggestions = [
    { id: 'rec-1', type: 'recent', title: "Docker Compose 一键部署", subtitle: "部署指南", icon: <Clock className="w-4 h-4" /> },
    { id: 'rec-2', type: 'recent', title: "错误码字典查询", subtitle: "API 手册", icon: <Hash className="w-4 h-4" /> },
    { id: 'sug-1', type: 'suggest', title: "如何配置 Nginx 反向代理", subtitle: "跳转", icon: <FileText className="w-4 h-4" /> },
    { id: 'sug-2', type: 'suggest', title: "偏好设置", subtitle: "设置", icon: <Settings className="w-4 h-4" /> },
];

export default function Layout({ children, onNavigate }) {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchInputRef = useRef(null);
    const [searchIndex, setSearchIndex] = useState(0);

    // Keyboard Navigation for Search
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Command/Ctrl + K Toggle
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen((prev) => !prev);
            }

            if (!isSearchOpen) return;

            // Esc Close
            if (e.key === 'Escape') {
                setIsSearchOpen(false);
            }

            // Arrow Navigation
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSearchIndex(prev => (prev + 1) % searchSuggestions.length);
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSearchIndex(prev => (prev - 1 + searchSuggestions.length) % searchSuggestions.length);
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                console.log("Selected:", searchSuggestions[searchIndex].title);
                setIsSearchOpen(false); // Close on selection
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearchOpen, searchIndex]);

    // Focus Input on Open
    useEffect(() => {
        if (isSearchOpen) {
            setSearchIndex(0); // Reset selection
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [isSearchOpen]);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-orange-100 selection:text-orange-900">

            {/* Search Modal */}
            {isSearchOpen && (
                <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-200">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setIsSearchOpen(false)}
                    ></div>

                    <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center border-b border-slate-100 px-4 py-4 gap-3">
                            <Search className="w-5 h-5 text-slate-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="搜索文档、API、或跳转到..."
                                className="flex-1 text-lg bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400 h-8"
                            />
                            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-mono">ESC</span>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto p-2">
                            <div className="space-y-1">
                                {searchSuggestions.map((item, index) => (
                                    <div
                                        key={item.id}
                                        onClick={() => { console.log(item.title); setIsSearchOpen(false); }}
                                        onMouseEnter={() => setSearchIndex(index)}
                                        className={`flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors ${index === searchIndex ? 'bg-orange-50' : 'hover:bg-slate-50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-4 h-4 ${index === searchIndex ? 'text-orange-500' : 'text-slate-400'}`}>
                                                {item.icon}
                                            </div>
                                            <span className={`text-sm ${index === searchIndex ? 'text-slate-900 font-medium' : 'text-slate-700'}`}>
                                                {item.title}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs ${index === searchIndex ? 'text-orange-600' : 'text-slate-400'}`}>
                                                {item.subtitle}
                                            </span>
                                            {index === searchIndex && (
                                                <CornerDownLeft className="w-3.5 h-3.5 text-orange-400" />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-slate-50 border-t border-slate-100 px-4 py-2 flex justify-between items-center text-xs text-slate-500">
                            <div className="flex gap-4">
                                <span className="flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> 选择</span>
                                <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> 打开</span>
                            </div>
                            <div>小橘文档 Search v2.1</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Navbar */}
            <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">

                        {/* Logo Section */}
                        <div className="flex items-center gap-3">
                            {/* Logo Icon */}
                            <div onClick={() => onNavigate && onNavigate('home')} className="w-9 h-9 rounded-xl flex items-center justify-center bg-orange-50 border border-orange-100/50 shadow-[0_2px_8px_-2px_rgba(249,115,22,0.3)] p-0.5 overflow-hidden relative group hover:shadow-[0_4px_12px_-2px_rgba(249,115,22,0.4)] transition-shadow duration-300 cursor-pointer">
                                <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
                                    <path d="M12 3.5V6.5" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" />
                                    <circle cx="12" cy="14" r="8.5" className="fill-orange-500" />
                                    <path d="M12 6.5C12 6.5 10 1 5 3C1 5 4 10 12 6.5Z" className="fill-lime-500" />
                                </svg>
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-orange-100/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"></div>
                            </div>

                            {/* Text & Version Badge */}
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-bold tracking-tight text-slate-900">
                                    小橘<span className="text-orange-600">文档</span>
                                </span>

                                {/* 最终版版本号设计：温润发光玉石标签 */}
                                <button
                                    className="group flex items-center gap-1.5 px-2 py-0.5 ml-1 
                                    bg-lime-50  /* 内部极淡嫩绿 */
                                    border border-lime-200 /* 柔和边框 */
                                    text-lime-800 /* 深色文字 */
                                    rounded-[4px] /* 微方角 */
                                    shadow-[0_0_8px_rgba(132,204,22,0.2)] /* 基础光晕 */
                                    hover:bg-lime-100 /* 悬浮颜色加深 */
                                    hover:shadow-[0_0_15px_rgba(132,204,22,0.4)] /* 悬浮光晕增强 */
                                    hover:border-lime-300 hover:-translate-y-0.5 
                                    transition-all duration-300 cursor-pointer"
                                    onClick={() => console.log("Open Changelog")}
                                    title="点击查看更新日志"
                                >
                                    <Leaf className="w-3 h-3 text-lime-600 fill-lime-200/50 group-hover:fill-lime-500 group-hover:text-lime-700 group-hover:rotate-12 transition-all duration-300" />
                                    <span className="text-[11px] font-bold tracking-wide font-mono">
                                        v{packageJson.version}
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 sm:gap-6">
                            <div
                                className="hidden md:flex relative group cursor-pointer"
                                onClick={() => setIsSearchOpen(true)}
                            >
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-4 w-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                                </div>
                                <div className="pl-10 pr-4 py-2 w-64 bg-slate-100 border border-transparent rounded-full text-sm text-slate-400 group-hover:bg-white group-hover:ring-2 group-hover:ring-orange-500/50 group-hover:border-orange-500 transition-all shadow-inner flex items-center justify-between">
                                    <span>搜索文档...</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] bg-white text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 shadow-sm">
                                            ⌘K
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <button
                                className="md:hidden p-2 text-slate-500 hover:text-slate-700"
                                onClick={() => setIsSearchOpen(true)}
                            >
                                <Search className="w-5 h-5" />
                            </button>

                            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                                <button className="p-2 text-slate-500 hover:text-orange-600 transition-colors relative">
                                    <Bell className="w-5 h-5" />
                                    <span className="absolute top-1.5 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                                </button>

                                {/* User Dropdown */}
                                <div className="relative group z-50">
                                    {/* Trigger */}
                                    <div className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 rounded-full pr-3 transition-colors">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 border border-white shadow-sm overflow-hidden">
                                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
                                        </div>
                                        <span className="text-sm font-medium text-slate-700 hidden sm:block">访客用户</span>
                                        <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:block group-hover:rotate-180 transition-transform" />
                                    </div>

                                    <div className="absolute right-0 top-full pt-2 w-56 hidden group-hover:block animate-in fade-in slide-in-from-top-1 duration-200">
                                        <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-2">
                                            <div className="px-3 py-2 border-b border-slate-100 mb-1">
                                                <p className="text-sm font-semibold text-slate-800">未登录</p>
                                                <p className="text-xs text-slate-500">请登录以保存进度</p>
                                            </div>
                                            {/* 修改这里：添加 onClick 事件 */}
                                            <button
                                                onClick={() => onNavigate && onNavigate('login')}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-orange-50 hover:text-orange-600 rounded-lg transition-colors text-left"
                                            >
                                                <LogIn className="w-4 h-4" />
                                                立即登录 / 注册
                                            </button>
                                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-left">
                                                <Settings className="w-4 h-4" />
                                                偏好设置
                                            </button>
                                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-left">
                                                <BookOpen className="w-4 h-4" />
                                                帮助中心
                                            </button>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content Rendered Here */}
            {children}

            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none z-[-1] opacity-40">
                <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-orange-50/50 to-transparent"></div>
                <div className="absolute right-0 top-20 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl"></div>
                <div className="absolute left-10 top-40 w-72 h-72 bg-orange-100/30 rounded-full blur-3xl"></div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
                <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px', maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }}></div>
            </div>
        </div>
    );
}