import React from 'react';
import {
    FileText, MoreHorizontal, Edit, Trash, Clock, Folder
} from 'lucide-react';
import { ArticleItem } from '@/api/article';

// --- 颜色主题配置 (与 CategoriesPage 保持一致) ---
const THEME_STYLES: Record<string, { bg: string, text: string, border: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100' },
    pink: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-100' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
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

    // 获取分类主题样式
    const categoryTheme = article.category && article.category.themeId
        ? THEME_STYLES[article.category.themeId] || THEME_STYLES['blue']
        : THEME_STYLES['slate'];

    // --- 网格视图 ---
    if (viewMode === 'grid') {
        return (
            <div
                onClick={() => onNavigate(article.collId || 'col_default', article.articleId)}
                className="group bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all duration-300 cursor-pointer relative overflow-visible h-full flex flex-col"
            >
                <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col gap-1.5 mb-1">
                        {/* 日期行 */}
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors"><FileText className="w-4 h-4" /></div>
                            <span className="text-xs text-slate-400">{article.date}</span>
                        </div>
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

                {/* 底部信息栏：左侧显示分类(带颜色)，右侧显示阅读时间 */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                    {/* 修改：移除 TagList，改为显示 Category Badge */}
                    <div className="flex items-center gap-2">
                        {article.category ? (
                            <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border font-medium ${categoryTheme.bg} ${categoryTheme.text} ${categoryTheme.border}`}>
                                <Folder className="w-3 h-3" />
                                {article.category.name}
                            </span>
                        ) : (
                            <span className="text-[10px] text-slate-300 px-2 py-0.5">未分类</span>
                        )}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{article.readTime}m</span>
                    </div>
                </div>
            </div>
        );
    }

    // --- 列表视图 ---
    return (
        <div
            onClick={() => onNavigate(article.collId || 'col_default', article.articleId)}
            className="group bg-white rounded-xl p-4 border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all duration-200 cursor-pointer flex items-center gap-4 relative"
        >
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                <FileText className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-700 truncate group-hover:text-indigo-600 transition-colors">
                        {article.title}
                    </h3>
                    <span className="text-[10px] text-slate-300 hidden sm:inline-block">|</span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline-block truncate max-w-[300px]">{article.desc}</span>
                </div>

                {/* 修改：移除 TagList，在标题下方或旁边显示分类 */}
                <div className="flex items-center">
                    {article.category && (
                        <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${categoryTheme.bg} ${categoryTheme.text} ${categoryTheme.border}`}>
                            <Folder className="w-2.5 h-2.5" />
                            {article.category.name}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex flex-col items-end justify-center gap-1 ml-4 shrink-0">
                <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="font-mono">{article.date}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" /> {article.readTime}m
                </div>
            </div>

            <div className="relative shrink-0 ml-2">
                <button onClick={onToggleMenu} className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                </button>
                {isMenuOpen && <MenuDropdown />}
            </div>
        </div>
    );
};