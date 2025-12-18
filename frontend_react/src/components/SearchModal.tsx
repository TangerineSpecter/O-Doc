import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, Loader2, Library, CornerDownLeft, Zap, FileText } from 'lucide-react';
import { Article, getArticles } from '../api/article';
import request from '../utils/request';

// 定义搜索建议项的类型
export interface SuggestionItem {
    id: string;
    type: 'ai' | 'article';
    title: string;
    subtitle: string;
    icon: ReactNode;
    data?: any;
}

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate?: (viewName: string, params?: any) => void;
    onChatStart?: () => void;
}

export default function SearchModal({ isOpen, onClose, onNavigate, onChatStart }: SearchModalProps) {
    const [searchIndex, setSearchIndex] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [keyword, setKeyword] = useState('');
    const [articleResults, setArticleResults] = useState<Article[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [anthologyMap, setAnthologyMap] = useState<Record<string, string>>({});

    // 初始化加载文集列表
    useEffect(() => {
        const fetchAnthologies = async () => {
            try {
                const res: any = await request.get('/anthology/list');
                const list = Array.isArray(res) ? res : (res.list || []);
                const map: Record<string, string> = {};
                list.forEach((item: any) => {
                    const id = item.collId || item.coll_id;
                    const title = item.title;
                    if (id && title) map[id] = title;
                });
                setAnthologyMap(map);
            } catch (error) {
                console.warn("SearchModal: Failed to load anthology map", error);
            }
        };
        if (isOpen) fetchAnthologies();
    }, [isOpen]);

    // 搜索逻辑
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!keyword.trim()) {
                setArticleResults([]);
                return;
            }
            setIsSearching(true);
            try {
                const res = await getArticles({ keyword });
                setArticleResults(res.slice(0, 8));
            } catch (error) {
                console.error("搜索失败", error);
            } finally {
                setIsSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [keyword]);

    // 焦点控制
    useEffect(() => {
        if (isOpen) {
            setSearchIndex(0);
            setKeyword('');
            setArticleResults([]);
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // 构建建议列表
    const suggestions: SuggestionItem[] = [
        {
            id: 'ai-chat',
            type: 'ai',
            title: keyword ? `询问 AI 关于 "${keyword}"` : "AI 智能对话",
            subtitle: "基于知识库回答问题",
            icon: <Zap className="w-4 h-4" />
        },
        ...articleResults.map(article => {
            const authorName = (article as any).author || (article as any).userName || 'admin';
            const collName = anthologyMap[article.collId] || article.collId || '未知文集';
            return {
                id: `art-${article.articleId}`,
                type: 'article' as const,
                title: article.title,
                subtitle: `文集: ${collName} · 作者: ${authorName}`,
                icon: <FileText className="w-4 h-4" />,
                data: article
            };
        })
    ];

    const handleSelectSuggestion = (item: SuggestionItem) => {
        onClose();
        if (item.type === 'ai') {
            onChatStart?.();
        } else if (item.type === 'article' && item.data && onNavigate) {
            onNavigate('article', item.data);
        }
    };

    // 键盘事件
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === 'Escape') onClose();
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
    }, [isOpen, searchIndex, suggestions]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center border-b border-slate-100 px-4 py-4 gap-3">
                    <Search className="w-5 h-5 text-slate-400" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="输入问题唤起 AI，或搜索文档标题..."
                        className="flex-1 text-lg bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400 h-8"
                    />
                    {isSearching && <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />}
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-mono">ESC</span>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-2">
                    {suggestions.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">暂无搜索结果</div>
                    ) : (
                        <div className="space-y-1">
                            {suggestions.map((item, index) => (
                                <div key={item.id}>
                                    {index === 1 && item.type === 'article' && (
                                        <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-t border-slate-100 mt-1">
                                            <Library className="w-3 h-3" />
                                            文章检索结果
                                        </div>
                                    )}
                                    <div
                                        onClick={() => handleSelectSuggestion(item)}
                                        onMouseEnter={() => setSearchIndex(index)}
                                        className={`flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors ${index === searchIndex ? 'bg-orange-50' : 'hover:bg-slate-50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'ai'
                                                ? (index === searchIndex ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-orange-500')
                                                : (index === searchIndex ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500')
                                                }`}>
                                                {item.icon}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className={`text-sm truncate ${index === searchIndex ? 'text-slate-900 font-medium' : 'text-slate-700'}`}>
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
                                                <CornerDownLeft className="w-3.5 h-3.5 text-orange-400" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}