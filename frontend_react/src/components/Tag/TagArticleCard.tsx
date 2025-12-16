import React from 'react';
import {
    FileText, MoreHorizontal, Edit, Trash, Clock
} from 'lucide-react';
import { ArticleItem } from '@/api/article';

// --- 颜色主题配置 (修改为实心样式，匹配 Article.tsx 风格) ---
// 补充了 TagsPage 中定义的所有颜色 (sky, amber 等)
const THEME_STYLES: Record<string, string> = {
    blue: 'bg-blue-600 text-white shadow-blue-500/30',
    emerald: 'bg-emerald-600 text-white shadow-emerald-500/30',
    orange: 'bg-orange-600 text-white shadow-orange-500/30',
    pink: 'bg-pink-600 text-white shadow-pink-500/30',
    violet: 'bg-violet-600 text-white shadow-violet-500/30',
    cyan: 'bg-cyan-600 text-white shadow-cyan-500/30',
    sky: 'bg-sky-600 text-white shadow-sky-500/30',
    amber: 'bg-amber-600 text-white shadow-amber-500/30',
    slate: 'bg-slate-600 text-white shadow-slate-500/30',
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

    // 获取分类主题样式 (只取一个 class 字符串)
    const categoryThemeClass = article.category && article.category.themeId
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

                {/* 底部信息栏 */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                    <div className="flex items-center gap-2">
                        {article.category ? (
                            // 修改：使用实心样式，移除 Folder 图标，圆角改为 rounded-full
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm ${categoryThemeClass}`}>
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
                        // 修改：使用实心样式，移除 Folder 图标
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${categoryThemeClass}`}>
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