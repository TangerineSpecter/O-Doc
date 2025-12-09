import React from 'react';
import { ChevronDown, ChevronRight, Search, X, Plus, BookOpen } from 'lucide-react';
import { ArticleNode } from '../../api/article';

interface OutlineSidebarProps {
    title?: string;
    docs: ArticleNode[];
    activeDocId?: string;
    expandedIds: string[];
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onToggleExpand: (e: React.MouseEvent, id: string) => void;
    onSelectDoc: (articleId: string) => void;
    onCreateDoc: () => void;
    onReset?: () => void;
    className?: string; // 支持外部样式注入
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
    onReset,
    className = ''
}: OutlineSidebarProps) {

    // 递归渲染树节点
    const renderItem = (item: ArticleNode, level = 0) => {
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expandedIds.includes(item.id) || searchQuery.length > 0; // 搜索时默认展开
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
                    style={{ paddingLeft }}
                >
                    <span className="truncate">{item.title}</span>
                    {hasChildren && (
                        <div
                            onClick={(e) => onToggleExpand(e, item.id)}
                            className="p-1 rounded-sm hover:bg-black/5 text-slate-400 transition-colors"
                        >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
            {/* Title Header */}
            <div
                onClick={onReset}
                className="h-14 flex items-center px-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors flex-shrink-0"
            >
                <BookOpen size={16} className="text-orange-500 mr-2" />
                <span className="font-bold text-slate-700 text-sm truncate">{title}</span>
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
                    <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                    {searchQuery && (
                        <button
                            onClick={() => onSearchChange('')}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                <button
                    onClick={onCreateDoc}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white border border-dashed border-slate-300 rounded-md text-xs text-slate-500 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50 transition-all"
                >
                    <Plus size={12} />
                    <span>新建文档</span>
                </button>
            </div>

            {/* Tree List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
                {docs.length > 0 ? (
                    docs.map(item => renderItem(item))
                ) : (
                    <div className="text-center text-xs text-slate-400 py-4">未找到文档</div>
                )}
            </div>

            <div className="p-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center flex-shrink-0 bg-white">
                {/* 底部保留位置，可放置设置按钮等 */}
            </div>
        </aside>
    );
}