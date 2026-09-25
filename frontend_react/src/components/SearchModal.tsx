import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {
    CornerDownLeft,
    File,
    FileText,
    Image as ImageIcon,
    Library,
    Loader2,
    MessageSquareText,
    Search,
    Sparkles,
    Zap
} from 'lucide-react';
import {globalSearch, type GlobalSearchItem, type GlobalSearchType} from '../api/search';
import {useGlobalSmartImageSearch} from '../hooks/useGlobalSmartImageSearch';
import {mergeGlobalSearchResults, visibleImageCount} from '../utils/globalSearchMerge';
import {useEscapeDismissal} from '../hooks/useEscapeDismissal';

interface SuggestionItem {
    id: string;
    type: 'ai' | GlobalSearchType;
    title: string;
    subtitle: string;
    excerpt?: string;
    icon: ReactNode;
    data?: GlobalSearchItem;
}

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate?: (viewName: string, params?: any) => void;
    onChatStart?: () => void;
}

const SEARCH_FILTERS: Array<{type: 'all' | GlobalSearchType; label: string}> = [
    {type: 'all', label: '全部'},
    {type: 'article', label: '文章'},
    {type: 'memo', label: '闪念'},
    {type: 'image', label: '图片'},
    {type: 'resource', label: '资源'},
    {type: 'prompt', label: '提示词'},
];

const EMPTY_RESULTS: GlobalSearchItem[] = [];
const EMPTY_COUNTS: Record<GlobalSearchType, number> = {article: 0, memo: 0, image: 0, resource: 0, prompt: 0};

const TYPE_META: Record<GlobalSearchType, {label: string; icon: ReactNode; activeClass: string; idleClass: string}> = {
    article: {
        label: '文章',
        icon: <FileText className="h-4 w-4"/>,
        activeClass: 'bg-blue-50 text-blue-600',
        idleClass: 'bg-slate-100 text-slate-500',
    },
    memo: {
        label: '闪念',
        icon: <MessageSquareText className="h-4 w-4"/>,
        activeClass: 'bg-lime-50 text-lime-700',
        idleClass: 'bg-slate-100 text-slate-500',
    },
    image: {
        label: '图片',
        icon: <ImageIcon className="h-4 w-4"/>,
        activeClass: 'bg-pink-50 text-pink-600',
        idleClass: 'bg-slate-100 text-slate-500',
    },
    resource: {
        label: '资源',
        icon: <File className="h-4 w-4"/>,
        activeClass: 'bg-indigo-50 text-indigo-600',
        idleClass: 'bg-slate-100 text-slate-500',
    },
    prompt: {
        label: '提示词',
        icon: <Sparkles className="h-4 w-4"/>,
        activeClass: 'bg-orange-50 text-orange-600',
        idleClass: 'bg-slate-100 text-slate-500',
    },
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightKeyword = (text: string, keyword: string) => {
    if (!keyword.trim()) return text;

    const parts = text.split(new RegExp(`(${escapeRegExp(keyword.trim())})`, 'ig'));
    return parts.map((part, index) => (
        part.toLowerCase() === keyword.trim().toLowerCase()
            ? <mark key={`${part}-${index}`} className="rounded bg-orange-100 px-0.5 text-orange-700">{part}</mark>
            : <span key={`${part}-${index}`}>{part}</span>
    ));
};

export default function SearchModal({isOpen, onClose, onNavigate, onChatStart}: SearchModalProps) {
    useEscapeDismissal(isOpen, onClose);
    const [searchIndex, setSearchIndex] = useState(0);
    const [keyword, setKeyword] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | GlobalSearchType>('all');
    const [results, setResults] = useState<GlobalSearchItem[]>([]);
    const [resolvedKeyword, setResolvedKeyword] = useState('');
    const [resolvedFilter, setResolvedFilter] = useState<'all' | GlobalSearchType>('all');
    const [counts, setCounts] = useState<Record<GlobalSearchType, number>>({
        article: 0,
        memo: 0,
        image: 0,
        resource: 0,
        prompt: 0,
    });
    const [isSearching, setIsSearching] = useState(false);
    const [smartEnabled, setSmartEnabled] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const onSmartResults = useCallback((hasResults: boolean) => { if (hasResults) setSearchIndex(1); }, []);
    const smart = useGlobalSmartImageSearch({isOpen, enabled: smartEnabled, keyword, filter: activeFilter, onResults: onSmartResults});
    const smartPending = smart.pending;
    const searchSmartNow = smart.searchNow;
    const resetSmart = smart.reset;

    const selectedTypes = useMemo(
        () => activeFilter === 'all' ? undefined : [activeFilter],
        [activeFilter]
    );

    useEffect(() => {
        let live = true;
        const timer = setTimeout(async () => {
            const normalizedKeyword = keyword.trim();
            if (!normalizedKeyword) {
                setResults([]);
                setCounts({article: 0, memo: 0, image: 0, resource: 0, prompt: 0});
                setResolvedKeyword('');
                setResolvedFilter(activeFilter);
                setIsSearching(false);
                return;
            }

            setIsSearching(true);
            try {
                const response = await globalSearch({
                    keyword: normalizedKeyword,
                    types: selectedTypes,
                    limit: 6,
                });
                if (!live) return;
                setResults(response.items || []);
                setResolvedKeyword(normalizedKeyword);
                setResolvedFilter(activeFilter);
                setCounts({
                    article: response.counts?.article || 0,
                    memo: response.counts?.memo || 0,
                    image: response.counts?.image || 0,
                    resource: response.counts?.resource || 0,
                    prompt: response.counts?.prompt || 0,
                });
            } catch (error) {
                if (!live) return;
                console.error('全局搜索失败', error);
                setResults([]);
                setResolvedKeyword(normalizedKeyword);
                setResolvedFilter(activeFilter);
                setCounts({article: 0, memo: 0, image: 0, resource: 0, prompt: 0});
            } finally {
                if (live) setIsSearching(false);
            }
        }, 260);

        return () => { live = false; clearTimeout(timer); };
    }, [keyword, selectedTypes, activeFilter]);

    useEffect(() => {
        if (!isOpen) return;
        let live = true;
        queueMicrotask(() => {
            if (!live) return;
            setSearchIndex(0);
            setKeyword('');
            setActiveFilter('all');
            setSmartEnabled(false);
            resetSmart();
            setResults([]);
            setResolvedKeyword('');
            setResolvedFilter('all');
            setCounts({article: 0, memo: 0, image: 0, resource: 0, prompt: 0});
        });
        const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 50);
        return () => { live = false; window.clearTimeout(focusTimer); };
    }, [isOpen, resetSmart]);

    const keywordReady = resolvedKeyword === keyword.trim() && resolvedFilter === activeFilter;
    const keywordItems = keywordReady ? results : EMPTY_RESULTS;
    const keywordCounts = keywordReady ? counts : EMPTY_COUNTS;
    const keywordPending = Boolean(keyword.trim()) && !keywordReady;
    const displayedResults = useMemo(
        () => mergeGlobalSearchResults(
            activeFilter === 'all' ? keywordItems : keywordItems.filter(item => item.type === activeFilter),
            smart.items,
            activeFilter,
        ),
        [keywordItems, smart.items, activeFilter],
    );
    const smartCountActive = smartEnabled && smart.items !== null && smart.items.length > 0 && !smart.error;
    const imageCount = visibleImageCount(keywordCounts.image, displayedResults, smartCountActive);

    const suggestions: SuggestionItem[] = useMemo(() => {
        const aiSuggestion: SuggestionItem = {
            id: 'ai-chat',
            type: 'ai',
            title: keyword.trim() ? `询问 AI 关于 "${keyword.trim()}"` : 'AI 智能对话',
            subtitle: '基于知识库回答问题',
            icon: <Zap className="h-4 w-4"/>,
        };

        return [
            aiSuggestion,
            ...displayedResults.map((item) => {
                const meta = TYPE_META[item.type];
                return {
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    subtitle: item.subtitle || meta.label,
                    excerpt: item.excerpt,
                    icon: meta.icon,
                    data: item,
                };
            }),
        ];
    }, [keyword, displayedResults]);

    const handleSelectSuggestion = useCallback((item?: SuggestionItem) => {
        if (!item) return;

        onClose();
        if (item.type === 'ai') {
            onChatStart?.();
            return;
        }

        const route = item.data?.route;
        if (route && onNavigate) {
            if (item.type === 'image' && item.data) {
                const routeParams = route.params || {};
                const imageId = routeParams.imageId
                    || routeParams.image_id
                    || item.data.id.replace(/^image:/, '');
                onNavigate(route.view, {...routeParams, imageId});
                return;
            }
            onNavigate(route.view, route.params);
        }
    }, [onClose, onChatStart, onNavigate]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isOpen) return;
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSearchIndex(prev => (prev + 1) % Math.max(suggestions.length, 1));
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSearchIndex(prev => (prev - 1 + suggestions.length) % Math.max(suggestions.length, 1));
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                if (smartEnabled && smartPending && keyword.trim()) {
                    searchSmartNow();
                    return;
                }
                handleSelectSuggestion(suggestions[searchIndex]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, searchIndex, suggestions, smartEnabled, smartPending, searchSmartNow, keyword, handleSelectSuggestion]);

    if (!isOpen) return null;

    const hasKeyword = Boolean(keyword.trim());
    const hasResults = displayedResults.length > 0;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[10vh] animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}/>
            <div
                className="relative flex max-h-[78vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
                onClick={event => event.stopPropagation()}
            >
                <div className="border-b border-slate-100 px-4 py-4">
                    <div className="flex items-center gap-3">
                        <Search className="h-5 w-5 text-slate-400"/>
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={keyword}
                            onChange={(event) => { setKeyword(event.target.value); setSearchIndex(0); }}
                            placeholder="搜索文章正文、闪念、图片描述或资源文件..."
                            className="h-8 flex-1 border-none bg-transparent text-lg text-slate-800 outline-none placeholder:text-slate-400"
                        />
                        {(isSearching || keywordPending || smart.pending) && <Loader2 className="h-4 w-4 animate-spin text-orange-500"/>}
                        <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">ESC</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {SEARCH_FILTERS.map(filter => {
                            const isActive = activeFilter === filter.type;
                            const count = filter.type === 'all'
                                ? keywordCounts.article + keywordCounts.memo + imageCount + keywordCounts.resource + keywordCounts.prompt
                                : filter.type === 'image' ? imageCount : keywordCounts[filter.type];

                            return (
                                <button
                                    key={filter.type}
                                    type="button"
                                    onClick={() => {
                                        setActiveFilter(filter.type);
                                        setSearchIndex(0);
                                    }}
                                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                                        isActive
                                            ? 'border-orange-200 bg-orange-50 text-orange-700'
                                            : 'border-slate-200 bg-white text-slate-500 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600'
                                    }`}
                                >
                                    {filter.label}
                                    {hasKeyword && <span className="ml-1 text-[10px] opacity-70">{count}{smartCountActive && (filter.type === 'all' || filter.type === 'image') ? '+' : ''}</span>}
                                </button>
                            );
                        })}
                        {(activeFilter === 'all' || activeFilter === 'image') && (
                            <button
                                type="button"
                                role="switch"
                                aria-checked={smartEnabled}
                                aria-label="智能搜图"
                                title="开启后，停止输入约 700 毫秒会检索图片画面；关闭后只使用关键词搜索"
                                onClick={() => { if (smartEnabled) resetSmart(); setSmartEnabled(value => !value); setSearchIndex(0); }}
                                className={`ml-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 ${smartEnabled ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500 hover:border-orange-200'}`}
                            >
                                <Sparkles className="h-3.5 w-3.5"/>
                                智能搜图
                                <span className={`relative h-4 w-7 rounded-full transition-colors ${smartEnabled ? 'bg-orange-500' : 'bg-slate-300'}`} aria-hidden="true">
                                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${smartEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}`}/>
                                </span>
                            </button>
                        )}
                    </div>
                    {smartEnabled && (activeFilter === 'all' || activeFilter === 'image') && (
                        <p role="status" className={`mt-2 text-xs ${smart.error ? 'text-amber-700' : 'text-slate-500'}`}>
                            {smart.error || (smart.pending ? '正在查找画面相关的图片…' : '已开启画面检索；输入停顿后自动合并图片结果。')}
                            {smart.error && <button type="button" onClick={() => { resetSmart(); searchSmartNow(); }} className="ml-2 font-semibold text-orange-700 underline underline-offset-2">重试</button>}
                        </p>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {!hasKeyword ? (
                        <div className="flex flex-col items-center justify-center px-8 py-12 text-center">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                                <Sparkles className="h-5 w-5"/>
                            </div>
                            <p className="text-sm font-semibold text-slate-800">输入关键词开始全局搜索</p>
                            <p className="mt-1 text-xs text-slate-500">支持文章正文、闪念内容、图片描述与资源文件名。</p>
                        </div>
                    ) : !hasResults && !isSearching && !keywordPending && !smart.pending ? (
                        <div className="px-8 py-12 text-center text-sm text-slate-400">暂无搜索结果</div>
                    ) : !hasResults ? (
                        <div className="flex items-center justify-center gap-2 px-8 py-12 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin"/>正在搜索…</div>
                    ) : (
                        <div className="space-y-1">
                            {suggestions.map((item, index) => {
                                const isSelected = index === searchIndex;
                                const typeMeta = item.type === 'ai' ? null : TYPE_META[item.type];

                                return (
                                    <div key={item.id}>
                                        {index === 1 && (
                                            <div className="mt-1 flex items-center gap-2 border-t border-slate-100 px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                <Library className="h-3 w-3"/>
                                                全局检索结果
                                            </div>
                                        )}
                                        <div
                                            onClick={() => handleSelectSuggestion(item)}
                                            onMouseEnter={() => setSearchIndex(index)}
                                            className={`flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-3 transition-colors ${
                                                isSelected ? 'bg-orange-50' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex min-w-0 items-start gap-3">
                                                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                                    item.type === 'ai'
                                                        ? (isSelected ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-orange-500')
                                                        : (isSelected ? typeMeta!.activeClass : typeMeta!.idleClass)
                                                }`}>
                                                    {item.icon}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                        {item.type !== 'ai' && (
                                                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                                                {TYPE_META[item.type].label}
                                                            </span>
                                                        )}
                                                        <span className={`line-clamp-1 text-sm ${isSelected ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                                                            {highlightKeyword(item.title, keyword)}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                                                        {highlightKeyword(item.subtitle, keyword)}
                                                    </p>
                                                    {item.excerpt && (
                                                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">
                                                            {highlightKeyword(item.excerpt, keyword)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {isSelected && (
                                                <div className="hidden shrink-0 items-center gap-2 sm:flex">
                                                    <span className="text-xs font-medium text-orange-600">
                                                        {item.type === 'ai' ? '开始对话' : '打开'}
                                                    </span>
                                                    <CornerDownLeft className="h-3.5 w-3.5 text-orange-400"/>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
