import React from 'react';
import { Clock, Edit, FileText, MoreHorizontal, Trash } from 'lucide-react';
import { ArticleItem } from '@/api/article';

// --- TagList 组件 (移至此处) ---
const getTagStyle = (tag: string) => {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) { hash = tag.charCodeAt(i) + ((hash << 5) - hash); }
    const palettes = [
        'bg-blue-50 text-blue-700 border-blue-100',
        'bg-emerald-50 text-emerald-700 border-emerald-100',
        'bg-violet-50 text-violet-700 border-violet-100',
        'bg-orange-50 text-orange-700 border-orange-100',
        'bg-rose-50 text-rose-700 border-rose-100',
        'bg-cyan-50 text-cyan-700 border-cyan-100',
    ];
    return palettes[Math.abs(hash) % palettes.length];
};

interface TagListProps {
    tags: string[];
    limit?: number;
    justify?: "start" | "end";
}

export const TagList = ({ tags, limit = 2, justify = "start" }: TagListProps) => {
    const displayTags = tags.slice(0, limit);
    const remaining = tags.length - limit;
    return (
        <div className={`flex items-center gap-1.5 flex-wrap ${justify === 'end' ? 'justify-end' : 'justify-start'}`}>
            {displayTags.map((tag, idx) => (
                <span key={idx} className={`px-2 py-0.5 text-[10px] rounded-md border whitespace-nowrap ${getTagStyle(tag)}`}>
                    {tag}
                </span>
            ))}
            {remaining > 0 && (
                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-md border border-slate-200 font-medium">+{remaining}</span>
            )}
        </div>
    );
};

// --- ArticleCard 组件 ---
interface CategoryArticleCardProps {
    article: ArticleItem;
    viewMode: 'grid' | 'list';
    onNavigate: (collId: string, articleId: string) => void;
    isMenuOpen: boolean;
    onToggleMenu: (e: React.MouseEvent) => void;
    onEdit: () => void;
    onDelete: () => void;
}

export const CategoryArticleCard = ({
    article,
    viewMode,
    onNavigate,
    isMenuOpen,
    onToggleMenu,
    onEdit,
    onDelete
}: CategoryArticleCardProps) => {

    const MenuDropdown = () => (
        <div className="absolute right-0 top-full mt-1 w-24 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-200">
            <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
            >
                <Edit className="w-3 h-3" /> 编辑
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
                <Trash className="w-3 h-3" /> 删除
            </button>
        </div>
    );

    // 网格视图
    if (viewMode === 'grid') {
        return (
            <div
                onClick={() => onNavigate(article.collId || 'col_default', article.articleId)}
                className="group bg-white rounded-xl p-4 border border-slate-200 hover:border-orange-300 hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col h-full relative"
            >
                <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="flex items-start gap-3 flex-1 overflow-hidden">
                        <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg shrink-0 mt-0.5"><FileText className="w-4 h-4" /></div>
                        <h3 className="text-sm font-bold text-slate-800 leading-snug group-hover:text-orange-600 transition-colors line-clamp-2">{article.title}</h3>
                    </div>
                    <div className="relative shrink-0">
                        <button onClick={onToggleMenu} className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"><MoreHorizontal className="w-4 h-4" /></button>
                        {isMenuOpen && <MenuDropdown />}
                    </div>
                </div>
                <p className="text-xs text-slate-500 line-clamp-1 mb-3 pl-[34px] leading-relaxed">{article.desc}</p>
                <div className="flex items-end justify-between w-full pt-3 border-t border-slate-50 mt-auto pl-1">
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium pb-0.5">
                        <span>{article.date}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readTime} 分钟</span>
                    </div>
                    <TagList tags={article.tags} limit={1} justify="end" />
                </div>
            </div>
        );
    }

    // 列表视图
    return (
        <div
            onClick={() => onNavigate(article.collId || 'col_default', article.articleId)}
            className="group bg-white rounded-xl p-4 border border-slate-200 hover:border-orange-300 hover:shadow-sm transition-all duration-200 cursor-pointer flex items-center gap-4 relative"
        >
            <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-100 transition-colors shrink-0"><FileText className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
                <h3 className="text-sm font-bold text-slate-700 truncate group-hover:text-orange-600 transition-colors">{article.title}</h3>
                <p className="text-xs text-slate-400 truncate hidden md:block">{article.desc}</p>
            </div>
            <div className="flex flex-col items-end justify-center gap-2 ml-4 shrink-0">
                <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="font-mono">{article.date}</span>
                    <span className="hidden sm:flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readTime}m</span>
                </div>
                <TagList tags={article.tags} limit={3} justify="end" />
            </div>
            <div className="relative shrink-0 ml-2">
                <button onClick={onToggleMenu} className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"><MoreHorizontal className="w-4 h-4" /></button>
                {isMenuOpen && <MenuDropdown />}
            </div>
        </div>
    );
};