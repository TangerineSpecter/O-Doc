import React from 'react';
import {
    FileText, MoreHorizontal, Edit, Trash, Clock, ChevronRight
} from 'lucide-react';
import { ArticleItem } from '../../api/article';

// --- 1. 简单的标签列表组件 ---
const SimpleTagList = ({ tags }: { tags: string[] }) => {
    if (!tags || tags.length === 0) return null;
    return (
        <div className="flex gap-2 mt-1.5">
            {tags.slice(0, 4).map((tag, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-md border border-slate-200">
                    # {tag}
                </span>
            ))}
        </div>
    );
};

interface TagArticleCardProps {
    article: ArticleItem;
    viewMode: 'grid' | 'list';
    onNavigate: (collId: string, articleId: string) => void;
    isMenuOpen: boolean;
    onToggleMenu: (e: React.MouseEvent) => void;
    onEdit: () => void;
    onDelete: () => void;
}

export const TagArticleCard = ({
    article,
    viewMode,
    onNavigate,
    isMenuOpen,
    onToggleMenu,
    onEdit,
    onDelete
}: TagArticleCardProps) => {

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

    // --- 2. 网格视图 (保持您原来的 Indigo 风格) ---
    if (viewMode === 'grid') {
        return (
            <div
                onClick={() => onNavigate(article.collId || 'col_default', article.articleId)}
                className="group bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all duration-300 cursor-pointer relative overflow-visible h-full flex flex-col"
            >
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors"><FileText className="w-4 h-4" /></div>
                        <span className="text-xs text-slate-400">{article.date}</span>
                    </div>

                    <div className="relative">
                        <button
                            onClick={onToggleMenu}
                            className="text-slate-300 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-100"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {isMenuOpen && <MenuDropdown />}
                    </div>
                </div>

                <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2">{article.title}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-4 leading-relaxed flex-1">{article.desc}</p>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                    <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {article.readTime} 分钟阅读</span>
                    </div>
                    <span className="text-xs font-bold text-indigo-600 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all flex items-center gap-1">阅读全文 <ChevronRight className="w-3 h-3" /></span>
                </div>
            </div>
        );
    }

    // --- 3. 列表视图 (全新设计：补充了标签展示) ---
    return (
        <div
            onClick={() => onNavigate(article.collId || 'col_default', article.articleId)}
            className="group bg-white rounded-xl p-4 border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all duration-200 cursor-pointer flex items-center gap-4 relative"
        >
            {/* 左侧图标 */}
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                <FileText className="w-5 h-5" />
            </div>

            {/* 中间内容：标题 + 描述 + 标签 */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-700 truncate group-hover:text-indigo-600 transition-colors">
                        {article.title}
                    </h3>
                    <span className="text-[10px] text-slate-300 hidden sm:inline-block">|</span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline-block truncate max-w-[300px]">{article.desc}</span>
                </div>

                {/* ✨ 这里展示了原来缺失的标签 ✨ */}
                <SimpleTagList tags={article.tags} />
            </div>

            {/* 右侧信息：日期 + 阅读时间 */}
            <div className="flex flex-col items-end justify-center gap-1 ml-4 shrink-0">
                <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="font-mono">{article.date}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" /> {article.readTime}m
                </div>
            </div>

            {/* 菜单按钮 */}
            <div className="relative shrink-0 ml-2">
                <button onClick={onToggleMenu} className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                </button>
                {isMenuOpen && <MenuDropdown />}
            </div>
        </div>
    );
};