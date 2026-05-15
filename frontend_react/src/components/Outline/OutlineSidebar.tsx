import React, {useEffect, useRef, useState} from 'react';
import {BookOpen, ChevronDown, ChevronRight, FileText, Globe, Plus, RefreshCw, Search, X, Loader2} from 'lucide-react';
import {ArticleNode} from '@/api/article.ts';

interface OutlineSidebarProps {
    title?: string;
    docs: ArticleNode[];
    activeDocId?: string;
    expandedIds: string[];
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onToggleExpand: (e: React.MouseEvent, id: string) => void;
    onSelectDoc: (articleId: string) => void;

    onCreateDoc: () => void;       // 保留：新建文档
    onSaveWebpage: () => void;     // 新增：新建网页

    onReset?: () => void;
    className?: string;
    onSyncCollection?: () => void;
    isCollectionSyncing?: boolean;
    canManage?: boolean;
}

export default function OutlineSidebar({
                                           title = '文档目录',
                                           docs,
                                           activeDocId,
                                           expandedIds,
                                           searchQuery,
                                           onSearchChange,
                                           onToggleExpand,
                                           onSelectDoc,
                                           onCreateDoc,
                                           onSaveWebpage, // 解构新增的 prop
                                           onReset,
                                           onSyncCollection,
                                           isCollectionSyncing = false,
                                           canManage = true,
                                           className = ''
                                       }: OutlineSidebarProps) {
    // 新增：控制新建菜单的显示
    const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
    const createMenuRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭菜单
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
                setIsCreateMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ... (保留 renderItem 函数不变)
    const renderItem = (item: ArticleNode, level = 0) => {
        // ... (原代码)
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expandedIds.includes(item.id) || searchQuery.length > 0;
        const isActive = activeDocId === item.articleId;
        const paddingLeft = 12 + level * 16;

        return (
            <div key={item.id}>
                <div
                    onClick={() => onSelectDoc(item.articleId)}
                    className={`
                        group flex items-center justify-between py-1.5 pr-2 cursor-pointer text-sm transition-colors border-l-2
                        ${isActive
                        ? 'border-orange-500 bg-orange-50 text-orange-700 font-medium'
                        : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                    `}
                    style={{paddingLeft}}
                >
                    <div className="flex items-center gap-2 truncate">
                        {/* [新增] 状态图标 */}
                        {item.is_polishing ? (
                            <div className="flex items-center gap-1 text-purple-500" title="AI 正在润色中...">
                                <Loader2 size={12} className="animate-spin"/>
                            </div>
                        ) : null}

                        <span className={`truncate ${item.is_polishing ? 'text-slate-400 italic' : ''}`}>
                            {item.title}
                        </span>
                    </div>
                    {hasChildren && (
                        <div
                            onClick={(e) => onToggleExpand(e, item.id)}
                            className="p-1 rounded-sm hover:bg-black/5 text-slate-400 transition-colors"
                        >
                            {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                        </div>
                    )}
                </div>

                {hasChildren && isExpanded && (
                    <div>
                        {item.children?.map(child => renderItem(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <aside className={`bg-white flex flex-col border-r border-slate-200 flex-shrink-0 h-full ${className}`}>
            {/* Title Header (保留原代码) */}
            <div
                onClick={onReset}
                className="h-14 flex items-center justify-between px-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors flex-shrink-0 group">
                <div className="flex items-center gap-2 overflow-hidden">
                    <BookOpen size={16} className="text-orange-500 flex-shrink-0"/>
                    <span className="font-bold text-slate-700 text-sm truncate">{title}</span>
                </div>

                {canManage && onSyncCollection && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onSyncCollection();
                        }}
                        disabled={isCollectionSyncing}
                        className={`
                            p-1.5 rounded-md text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all
                            ${isCollectionSyncing ? 'cursor-not-allowed opacity-100' : 'opacity-0 group-hover:opacity-100'}
                        `}
                        title="同步整个文集到知识库"
                    >
                        <RefreshCw size={14} className={isCollectionSyncing ? 'animate-spin text-indigo-600' : ''}/>
                    </button>
                )}
            </div>

            {/* Search & Actions */}
            <div className="p-3 flex-shrink-0 space-y-2">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="搜索目录..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-xs py-1.5 pl-8 pr-8 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all text-slate-600"
                    />
                    <Search size={12} className="absolute left-2.5 top-2 text-slate-400"/>
                    {searchQuery && (
                        <button
                            onClick={() => onSearchChange('')}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X size={12}/>
                        </button>
                    )}
                </div>

                {/* --- 修改部分：新建按钮改为 Dropdown --- */}
                {canManage && (
                <div className="relative" ref={createMenuRef}>
                    <button
                        onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
                        className={`
                            w-full flex items-center justify-center gap-1.5 py-1.5 border border-dashed rounded-md text-xs transition-all
                            ${isCreateMenuOpen
                            ? 'bg-orange-50 border-orange-300 text-orange-600'
                            : 'bg-white border-slate-300 text-slate-500 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50'}
                        `}
                    >
                        <Plus size={12}/>
                        <span>新建内容</span>
                    </button>

                    {/* Dropdown Menu */}
                    {isCreateMenuOpen && (
                        <div
                            className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            <button
                                onClick={() => {
                                    onCreateDoc();
                                    setIsCreateMenuOpen(false);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-slate-600 hover:bg-orange-50 hover:text-orange-700 transition-colors text-left"
                            >
                                <FileText size={14} className="text-orange-400"/>
                                <div>
                                    <div className="font-medium">新建文档</div>
                                    <div className="text-[10px] text-slate-400 scale-90 origin-left">创建空白 Markdown
                                        文档
                                    </div>
                                </div>
                            </button>
                            <div className="h-px bg-slate-50"></div>
                            <button
                                onClick={() => {
                                    onSaveWebpage();
                                    setIsCreateMenuOpen(false);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left"
                            >
                                <Globe size={14} className="text-blue-400"/>
                                <div>
                                    <div className="font-medium">保存网页</div>
                                    <div
                                        className="text-[10px] text-slate-400 scale-90 origin-left">抓取链接内容并保存
                                    </div>
                                </div>
                            </button>
                        </div>
                    )}
                </div>
                )}
            </div>

            {/* Tree List (保留原代码) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
                {docs.length > 0 ? (
                    docs.map(item => renderItem(item))
                ) : (
                    <div className="text-center text-xs text-slate-400 py-4">未找到文档</div>
                )}
            </div>

            <div
                className="p-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center flex-shrink-0 bg-white">
            </div>
        </aside>
    );
}
