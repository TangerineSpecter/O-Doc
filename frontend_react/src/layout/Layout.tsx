import {type ReactNode, useEffect, useRef, useState} from 'react';
import {
    ArrowUpCircle,
    ArrowUpDown,
    Bell,
    BookOpen,
    ChevronDown,
    CornerDownLeft,
    FileText,
    Leaf,
    Library,
    Loader2,
    LogIn, LogOut,
    Search,
    Settings,
    Zap
} from 'lucide-react';
import packageJson from '../../package.json';
import FloatingActionMenu from '../components/FloatingActionMenu';
import {AIChatWindow} from '../components/AIChatWindow';
import {Article, getArticles} from '../api/article';
import request from '../utils/request';
import {getUserInfo} from '../api/user';
import {useToast} from "@/components/common/ToastProvider.tsx";

interface LayoutProps {
    children: ReactNode;
    onNavigate?: (viewName: string, params?: any) => void;
}

// 辅助函数：版本比较
const compareVersions = (remoteVersion: string, localVersion: string) => {
    const v1 = remoteVersion.replace(/^v/, '').split('.').map(Number);
    const v2 = localVersion.replace(/^v/, '').split('.').map(Number);
    const len = Math.max(v1.length, v2.length);
    for (let i = 0; i < len; i++) {
        const num1 = v1[i] || 0;
        const num2 = v2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
};

// 定义搜索建议项的类型
interface SuggestionItem {
    id: string;
    type: 'ai' | 'article';
    title: string;
    subtitle: string;
    icon: ReactNode;
    data?: any;
}

export default function Layout({children, onNavigate}: LayoutProps) {
    // --- 搜索相关状态 ---
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchIndex, setSearchIndex] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // 输入关键词与结果
    const [keyword, setKeyword] = useState('');
    const [articleResults, setArticleResults] = useState<Article[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // 辅助数据：文集名称映射
    const [anthologyMap, setAnthologyMap] = useState<Record<string, string>>({});

    // AI 窗口状态
    const [isChatOpen, setIsChatOpen] = useState(false);

    // 版本检查状态
    const [hasNewVersion, setHasNewVersion] = useState(false);

    // --- 用户信息状态 ---
    const [userInfo, setUserInfo] = useState<any>(null);
    const {success} = useToast();

    // 初始化时获取用户信息
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            getUserInfo().then(res => {
                setUserInfo(res);
            }).catch(() => {
                // Token 无效或过期，清除
                localStorage.removeItem('token');
                setUserInfo(null);
            });
        }
    }, []);

    // 退出登录处理
    const handleLogout = () => {
        localStorage.removeItem('token');
        setUserInfo(null);
        if (onNavigate) onNavigate('login');
    };

    // --- 0. 初始化加载文集列表 (用于 ID 转 Name) ---
    useEffect(() => {
        const fetchAnthologies = async () => {
            try {
                // 尝试获取文集列表构建映射表
                const res: any = await request.get('/anthology/list');
                // 兼容不同的返回结构
                const list = Array.isArray(res) ? res : (res.list || []);
                const map: Record<string, string> = {};
                list.forEach((item: any) => {
                    // 兼容后端可能返回的字段名 (camelCase 或 snake_case)
                    const id = item.collId || item.coll_id;
                    const title = item.title;
                    if (id && title) {
                        map[id] = title;
                    }
                });
                setAnthologyMap(map);
            } catch (error) {
                console.warn("Layout: Failed to load anthology map", error);
            }
        };
        fetchAnthologies();
    }, []);

    // --- 1. 构建混合建议列表 ---
    const suggestions: SuggestionItem[] = [
        // 固定项：AI 对话
        {
            id: 'ai-chat',
            type: 'ai',
            title: keyword ? `询问 AI 关于 "${keyword}"` : "AI 智能对话",
            subtitle: "基于知识库回答问题",
            icon: <Zap className="w-4 h-4"/>
        },
        // 动态项：文章搜索结果
        ...articleResults.map(article => {
            // 处理作者字段可能的不同命名
            const authorName = (article as any).author || (article as any).userName || (article as any).user_id || 'admin';
            // 处理文集名称
            const collName = anthologyMap[article.collId] || article.collId || '未知文集';

            return {
                id: `art-${article.articleId}`,
                type: 'article' as const,
                title: article.title,
                subtitle: `文集: ${collName} · 作者: ${authorName}`,
                icon: <FileText className="w-4 h-4"/>,
                data: article
            };
        })
    ];

    // --- 2. 搜索逻辑 (带防抖) ---
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!keyword.trim()) {
                setArticleResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const res = await getArticles({keyword});
                setArticleResults(res.slice(0, 8));
            } catch (error) {
                console.error("搜索失败", error);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [keyword]);

    // --- 版本检查 ---
    useEffect(() => {
        const checkUpdate = async () => {
            try {
                const response = await fetch('https://api.github.com/repos/TangerineSpecter/O-Doc/tags');
                if (response.ok) {
                    const tags = await response.json();
                    if (tags.length > 0) {
                        const latestTag = tags[0].name;
                        const currentVer = packageJson.version;
                        if (compareVersions(latestTag, currentVer) === 1) {
                            setHasNewVersion(true);
                        }
                    }
                }
            } catch (error) {
                console.warn("检查更新失败:", error);
            }
        };
        checkUpdate();
    }, []);

    // --- 键盘事件处理 ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen((prev) => !prev);
            }

            if (!isSearchOpen) return;

            if (e.key === 'Escape') {
                setIsSearchOpen(false);
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSearchIndex(prev => (prev + 1) % suggestions.length);
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSearchIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                handleSelectSuggestion(suggestions[searchIndex]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearchOpen, searchIndex, suggestions]);

    useEffect(() => {
        if (isSearchOpen) {
            setSearchIndex(0);
            setKeyword('');
            setArticleResults([]);
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [isSearchOpen]);

    const handleVersionClick = () => {
        window.open('https://github.com/TangerineSpecter/O-Doc', '_blank');
    };

    // --- 3. 处理选中逻辑 ---
    const handleSelectSuggestion = (item: SuggestionItem) => {
        setIsSearchOpen(false);

        if (item.type === 'ai') {
            setIsChatOpen(true);
        } else if (item.type === 'article' && item.data) {
            if (onNavigate) {
                onNavigate('article', item.data);
            }
        }
    };

    return (
        <div
            className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-orange-100 selection:text-orange-900">

            <AIChatWindow isOpen={isChatOpen} onClose={() => setIsChatOpen(false)}/>

            {/* Search Modal */}
            {isSearchOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-200">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setIsSearchOpen(false)}
                    ></div>

                    <div
                        className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center border-b border-slate-100 px-4 py-4 gap-3">
                            <Search className="w-5 h-5 text-slate-400"/>
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                placeholder="输入问题唤起 AI，或搜索文档标题..."
                                className="flex-1 text-lg bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400 h-8"
                            />
                            {isSearching && <Loader2 className="w-4 h-4 text-orange-500 animate-spin"/>}
                            <span
                                className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-mono">ESC</span>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto p-2">
                            {suggestions.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm">暂无搜索结果</div>
                            ) : (
                                <div className="space-y-1">
                                    {suggestions.map((item, index) => (
                                        <div key={item.id}>
                                            {/* 分栏标题：仅在 AI 选项(index 0) 之后的第一个文章项显示 */}
                                            {index === 1 && item.type === 'article' && (
                                                <div
                                                    className="px-3 pt-3 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-t border-slate-100 mt-1">
                                                    <Library className="w-3 h-3"/>
                                                    文章检索结果
                                                </div>
                                            )}

                                            <div
                                                onClick={() => handleSelectSuggestion(item)}
                                                onMouseEnter={() => setSearchIndex(index)}
                                                className={`flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                                                    index === searchIndex ? 'bg-orange-50' : 'hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                                            item.type === 'ai'
                                                                ? (index === searchIndex ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-orange-500')
                                                                : (index === searchIndex ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500')
                                                        }`}>
                                                        {item.icon}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span
                                                            className={`text-sm truncate ${index === searchIndex ? 'text-slate-900 font-medium' : 'text-slate-700'}`}>
                                                            {item.title}
                                                        </span>
                                                        <span className="text-xs text-slate-400 truncate">
                                                            {item.subtitle}
                                                        </span>
                                                    </div>
                                                </div>

                                                {index === searchIndex && (
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-xs text-orange-600 font-medium">
                                                            {item.type === 'ai' ? '开始对话' : '跳转文档'}
                                                        </span>
                                                        <CornerDownLeft className="w-3.5 h-3.5 text-orange-400"/>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div
                            className="bg-slate-50 border-t border-slate-100 px-4 py-2 flex justify-between items-center text-xs text-slate-500">
                            <div className="flex gap-4">
                                <span className="flex items-center gap-1"><ArrowUpDown className="w-3 h-3"/> 选择</span>
                                <span className="flex items-center gap-1"><CornerDownLeft
                                    className="w-3 h-3"/> 确认</span>
                            </div>
                            <div>小橘文档 Search Pro</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Navbar (保持原有逻辑) */}
            <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">

                        <div className="flex items-center gap-3">
                            <div onClick={() => onNavigate && onNavigate('home')}
                                 className="w-9 h-9 rounded-xl flex items-center justify-center bg-orange-50 border border-orange-100/50 shadow-[0_2px_8px_-2px_rgba(249,115,22,0.3)] p-0.5 overflow-hidden relative group hover:shadow-[0_4px_12px_-2px_rgba(249,115,22,0.4)] transition-shadow duration-300 cursor-pointer">
                                <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
                                    <path d="M12 3.5V6.5" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round"/>
                                    <circle cx="12" cy="14" r="8.5" className="fill-orange-500"/>
                                    <path d="M12 6.5C12 6.5 10 1 5 3C1 5 4 10 12 6.5Z" className="fill-lime-500"/>
                                </svg>
                                <div
                                    className="absolute inset-0 bg-gradient-to-b from-transparent to-orange-100/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"></div>
                            </div>

                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-bold tracking-tight text-slate-900">
                                    小橘<span className="text-orange-600">文档</span>
                                </span>
                                <button
                                    className={`group flex items-center gap-1.5 px-2 py-0.5 ml-1 rounded-[4px] shadow-[0_0_8px_rgba(132,204,22,0.2)] hover:shadow-[0_0_15px_rgba(132,204,22,0.4)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer relative overflow-hidden ${hasNewVersion ? 'bg-orange-50 border border-orange-200 text-orange-700' : 'bg-lime-50 border border-lime-200 text-lime-800'}`}
                                    onClick={handleVersionClick}
                                >
                                    {hasNewVersion ?
                                        <ArrowUpCircle className="w-3 h-3 text-orange-500 animate-bounce"/> :
                                        <Leaf className="w-3 h-3 text-lime-600"/>}
                                    <span
                                        className="text-[11px] font-bold tracking-wide font-mono relative z-10">v{packageJson.version}</span>
                                    {hasNewVersion && (
                                        <span className="absolute top-0 right-0 -mt-0.5 -mr-0.5 flex h-2 w-2">
                                            <span
                                                className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span
                                                className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 sm:gap-6">
                            <div
                                className="hidden md:flex relative group cursor-pointer"
                                onClick={() => setIsSearchOpen(true)}
                            >
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search
                                        className="h-4 w-4 text-slate-400 group-hover:text-orange-500 transition-colors"/>
                                </div>
                                <div
                                    className="pl-10 pr-4 py-2 w-72 bg-slate-100 border border-transparent rounded-full text-sm text-slate-400 group-hover:bg-white group-hover:ring-2 group-hover:ring-orange-500/50 group-hover:border-orange-500 transition-all shadow-inner flex items-center justify-between">
                                    <span>搜索文档 / AI 对话...</span>
                                    <div className="flex items-center gap-1">
                                        <span
                                            className="text-[10px] bg-white text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 shadow-sm">
                                            ⌘K
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <button
                                className="md:hidden p-2 text-slate-500 hover:text-slate-700"
                                onClick={() => setIsSearchOpen(true)}
                            >
                                <Search className="w-5 h-5"/>
                            </button>

                            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                                <button className="p-2 text-slate-500 hover:text-orange-600 transition-colors relative">
                                    <Bell className="w-5 h-5"/>
                                    <span
                                        className="absolute top-1.5 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                                </button>
                                <div className="relative group z-50">
                                    <div
                                        className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 rounded-full pr-3 transition-colors">
                                        <div
                                            className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 border border-white shadow-sm overflow-hidden">
                                            {/* 根据是否有 userInfo 显示头像 */}
                                            <img
                                                src={userInfo?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=Visitor"}
                                                alt="User"
                                            />
                                        </div>
                                        {/* 显示用户名或访客 */}
                                        <span className="text-sm font-medium text-slate-700 hidden sm:block">
                                            {userInfo ? (userInfo.username || '管理员') : '访客用户'}
                                        </span>
                                        <ChevronDown
                                            className="w-3 h-3 text-slate-400 hidden sm:block group-hover:rotate-180 transition-transform"/>
                                    </div>

                                    {/* 下拉菜单 */}
                                    <div
                                        className="absolute right-0 top-full pt-2 w-56 hidden group-hover:block animate-in fade-in slide-in-from-top-1 duration-200">
                                        <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-2">
                                            <div className="px-3 py-2 border-b border-slate-100 mb-1">
                                                <p className="text-sm font-semibold text-slate-800">
                                                    {userInfo ? '已登录' : '未登录'}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {userInfo ? `你好，${userInfo.username}` : '请登录以保存进度'}
                                                </p>
                                            </div>

                                            {/* 根据登录状态显示不同按钮 */}
                                            {!userInfo ? (
                                                <button onClick={() => onNavigate && onNavigate('login')}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-orange-50 hover:text-orange-600 rounded-lg transition-colors text-left">
                                                    <LogIn className="w-4 h-4"/> 立即登录 / 注册
                                                </button>
                                            ) : (
                                                <button onClick={handleLogout}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left">
                                                    <LogOut className="w-4 h-4"/> 退出登录
                                                </button>
                                            )}

                                            <button onClick={() => onNavigate && onNavigate('settings')}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-left">
                                                <Settings className="w-4 h-4"/> 系统设置
                                            </button>
                                            <button
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-left">
                                                <BookOpen className="w-4 h-4"/> 帮助中心
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            {children}
            <FloatingActionMenu/>

            <div className="fixed inset-0 pointer-events-none z-[-1] opacity-40">
                <div
                    className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-orange-50/50 to-transparent"></div>
                <div className="absolute right-0 top-20 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl"></div>
                <div className="absolute left-10 top-40 w-72 h-72 bg-orange-100/30 rounded-full blur-3xl"></div>
                <div
                    className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
                <div className="absolute inset-0" style={{
                    backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)'
                }}></div>
            </div>
        </div>
    );
}