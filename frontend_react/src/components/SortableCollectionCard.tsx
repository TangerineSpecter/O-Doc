import React from 'react';
import {
    GripHorizontal, MoreHorizontal, Edit, Trash,
    FileText, Plus, ChevronDown, ArrowUp, Lock
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Anthology } from '../api/anthology';

// 扩展 Anthology 类型以包含前端渲染所需的 icon 组件
export interface Collection extends Anthology {
    icon: React.ReactNode;
}

interface SortableCollectionCardProps {
    item: Collection;
    onNavigate: (viewName: string, params?: any) => void;
    isMenuOpen: boolean;
    onToggleMenu: (e: React.MouseEvent) => void;
    onEdit: () => void;
    onDelete: () => void;
}

export const SortableCollectionCard = ({
    item,
    onNavigate,
    isMenuOpen,
    onToggleMenu,
    onEdit,
    onDelete
}: SortableCollectionCardProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: item.id,
        disabled: item.isTop
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? 'none' : transition,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative' as const,
        touchAction: 'none'
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                group bg-white rounded-xl border transition-all duration-200 flex flex-col overflow-hidden relative
                ${isDragging ? 'shadow-2xl ring-2 ring-orange-400 opacity-90 scale-[1.02] z-50' : 'border-slate-200 hover:border-orange-200 hover:shadow-lg'}
                ${item.isTop ? 'bg-slate-50/30' : ''}
            `}
        >
            {/* 拖拽手柄 */}
            {!item.isTop && (
                <div
                    {...attributes}
                    {...listeners}
                    className="absolute top-1.5 left-1/2 -translate-x-1/2 w-12 h-5 flex items-center justify-center rounded-full text-slate-300 hover:text-orange-500 hover:bg-orange-50 cursor-grab active:cursor-grabbing z-30 transition-colors opacity-0 group-hover:opacity-100"
                    title="按住拖动排序"
                >
                    <GripHorizontal className="w-4 h-4" />
                </div>
            )}

            {/* 右上角菜单 */}
            <div className="absolute top-2 right-2 z-20">
                <button
                    onClick={onToggleMenu}
                    className={`p-1.5 rounded-md transition-colors ${isMenuOpen ? 'bg-orange-50 text-orange-600' : 'text-slate-300 hover:bg-slate-50 hover:text-slate-600 opacity-0 group-hover:opacity-100'}`}
                >
                    <MoreHorizontal className="w-4 h-4" />
                </button>

                {isMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-28 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-orange-600 flex items-center gap-2"
                        >
                            <Edit className="w-3.5 h-3.5" /> 编辑
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                            <Trash className="w-3.5 h-3.5" /> 删除
                        </button>
                    </div>
                )}
            </div>

            {/* 卡片头部信息 */}
            <div className="p-3 pb-2 pt-6">
                <div className="flex justify-between items-start mb-2 pr-6">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-slate-50 rounded-md border border-slate-100 group-hover:bg-orange-50 group-hover:border-orange-100 transition-colors">
                            {item.icon}
                        </div>
                        <div className="flex items-center gap-2">
                            <h3
                                onClick={() => onNavigate('article', { collId: item.coll_id, title: item.title })}
                                className="font-bold text-slate-800 text-base leading-tight group-hover:text-orange-600 transition-colors cursor-pointer line-clamp-1"
                            >
                                {item.title}
                            </h3>
                            {item.isTop && <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-50 border border-red-100 text-[10px] font-bold text-red-600 leading-none"><ArrowUp className="w-2.5 h-2.5" strokeWidth={3} />置顶</span>}
                            {item.permission === 'private' && <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-500 leading-none"><Lock className="w-2.5 h-2.5" /></span>}
                        </div>
                    </div>
                    <span className="bg-slate-50 text-slate-400 text-[10px] font-semibold px-1.5 py-0.5 rounded min-w-[1.5rem] text-center">{item.count}</span>
                </div>
                <p className="text-slate-500 text-xs line-clamp-2 leading-relaxed mb-2 h-9">{item.description}</p>
            </div>

            {/* 文章列表预览 */}
            <div className="flex-1 bg-slate-50/30 border-t border-slate-100 p-1">
                {item.articles && item.articles.length > 0 ? (
                    <ul className="space-y-0.5">
                        {item.articles.map((article, idx) => (
                            <li key={idx}
                                onClick={() => onNavigate('article', { collId: item.coll_id, articleId: article.article_id, title: item.title, articleTitle: article.title })}
                                className="group/item flex items-center justify-between py-1.5 px-2 rounded hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <FileText className="w-3 h-3 text-slate-300 group-hover/item:text-orange-500 flex-shrink-0" />
                                    <span className="text-xs text-slate-600 truncate group-hover/item:text-slate-900 transition-colors">{article.title}</span>
                                </div>
                                <span className="text-xs text-slate-300 font-mono whitespace-nowrap pl-2">{article.date}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 gap-2">
                        <div className="bg-white p-2 rounded-full border border-dashed border-slate-300"><Plus className="w-4 h-4 text-slate-300" /></div>
                        <span className="text-[10px]">暂无文档，点击创建</span>
                    </div>
                )}
            </div>

            {/* 底部查看全部 */}
            <div className="bg-white border-t border-slate-50 h-0 group-hover:h-8 transition-all duration-300 overflow-hidden flex items-center justify-center">
                <button
                    onClick={() => onNavigate('article', { collId: item.coll_id, title: item.title })}
                    className="text-[10px] font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity delay-75"
                >
                    查看全部 <ChevronDown className="w-2.5 h-2.5 -rotate-90" />
                </button>
            </div>
        </div>
    );
};