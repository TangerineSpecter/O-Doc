import {ArrowRight, BookOpenText, Clock, Eye, Star} from 'lucide-react';
import {Link} from 'react-router-dom';
import AgentAvatar from '../AgentAvatar';
import {ProfessionBadge} from '../ProfessionBadge';
import PostRatingBadge from '../../AgentPost/PostRatingBadge';
import type {ArticleDisplayItem, ViewMode} from './types';

interface WorldWorksCardProps {
    item: ArticleDisplayItem;
    viewMode: ViewMode;
    onClose: () => void;
}

export default function WorldWorksCard({item, viewMode, onClose}: WorldWorksCardProps) {
    const {article, authorName, authorAvatar, profession, anthologyTitle, summary, readTime, formattedDate, rating, categoryName} = item;

    // 格式化评分展示（兼容浮点数和整数）
    const displayRating = rating ? (Number.isInteger(rating) ? rating : rating.toFixed(1)) : null;

    if (viewMode === 'list') {
        return (
            <Link
                to={`/article/${article.collId}/${article.articleId}`}
                state={{from: '/agent-world'}}
                onClick={onClose}
                className="group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 rounded-xl border border-slate-200/85 bg-white px-3 py-2.5 shadow-2xs transition-all duration-150 hover:border-orange-300 hover:shadow-xs hover:bg-orange-50/5 cursor-pointer"
            >
                {/* 左侧主体 */}
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <AgentAvatar name={authorName} avatar={authorAvatar} size="xs" />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-semibold text-slate-800">{authorName}</span>
                            {profession && (
                                <span className="scale-90 origin-left">
                                    <ProfessionBadge professionName={profession} size="xs" variant="purple" showIcon={false} />
                                </span>
                            )}
                            <span className="text-slate-300">·</span>
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600">
                                <BookOpenText className="h-2.5 w-2.5 text-slate-400" />
                                <span className="max-w-[100px] truncate">{anthologyTitle}</span>
                            </span>
                            {categoryName && (
                                <span className="rounded bg-orange-50 px-1 py-0.2 text-[10px] font-medium text-orange-700 border border-orange-200/50">
                                    {categoryName}
                                </span>
                            )}
                            <span className="text-slate-300">·</span>
                            <span className="text-[10px] text-slate-400">{formattedDate}</span>
                        </div>

                        {/* 标题与摘要单行并排或两行紧凑 */}
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                            <h4 className="text-xs font-bold text-slate-900 transition-colors group-hover:text-orange-600 truncate max-w-xs sm:max-w-md">
                                {article.title}
                            </h4>
                            {summary && (
                                <p className="hidden md:inline text-[11px] text-slate-400 truncate max-w-sm">
                                    {summary}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* 右侧数据与操作 */}
                <div className="flex shrink-0 items-center gap-3 self-end sm:self-center text-xs">
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="inline-flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            <span>{readTime}m</span>
                        </span>
                        {typeof article.readCount === 'number' && article.readCount > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                                <Eye className="h-2.5 w-2.5" />
                                <span>{article.readCount}</span>
                            </span>
                        )}
                        {displayRating && (
                            <span className="inline-flex items-center gap-0.5 font-bold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/50">
                                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-500" />
                                <span>{displayRating}</span>
                            </span>
                        )}
                    </div>

                    <div className="inline-flex items-center gap-0.5 text-xs font-semibold text-orange-600 transition-transform group-hover:translate-x-0.5">
                        <span className="text-[11px]">阅读</span>
                        <ArrowRight className="h-3 w-3" />
                    </div>
                </div>
            </Link>
        );
    }

    // 网格卡片模式 (Grid) - 精致小巧便签风，高度约 130px~140px
    return (
        <Link
            to={`/article/${article.collId}/${article.articleId}`}
            state={{from: '/agent-world'}}
            onClick={onClose}
            className="group relative flex flex-col justify-between rounded-xl border border-slate-200/85 bg-white p-3 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-xs hover:bg-orange-50/5 cursor-pointer"
        >
            <div>
                {/* 顶部：作者信息 + 评分/日期 */}
                <div className="flex items-center justify-between gap-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <AgentAvatar name={authorName} avatar={authorAvatar} size="xs" />
                        <span className="truncate text-xs font-semibold text-slate-800 group-hover:text-orange-600 transition-colors">
                            {authorName}
                        </span>
                        {profession && (
                            <span className="scale-90 origin-left">
                                <ProfessionBadge professionName={profession} size="xs" variant="purple" showIcon={false} />
                            </span>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                        {rating && Number.isInteger(rating) ? (
                            <PostRatingBadge rating={rating} />
                        ) : displayRating ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.2 text-[10px] font-bold text-amber-700 border border-amber-200/50">
                                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-500" />
                                <span>{displayRating}</span>
                            </span>
                        ) : null}
                        <span className="text-[10px] text-slate-400">{formattedDate}</span>
                    </div>
                </div>

                {/* 标题 */}
                <h4 className="mt-1.5 text-xs sm:text-[13px] font-bold leading-snug text-slate-900 transition-colors group-hover:text-orange-600 line-clamp-2">
                    {article.title}
                </h4>

                {/* 摘要 */}
                {summary && (
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500 line-clamp-2">
                        {summary}
                    </p>
                )}
            </div>

            {/* 底部元信息行 */}
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-1.5 text-[10px] text-slate-400">
                <div className="flex min-w-0 items-center gap-1.5 truncate">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.2 font-medium text-slate-600 truncate max-w-[110px]">
                        <BookOpenText className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                        <span className="truncate">{anthologyTitle}</span>
                    </span>
                    <span>·</span>
                    <span className="shrink-0">{readTime} 分钟</span>
                    {typeof article.readCount === 'number' && article.readCount > 0 && (
                        <>
                            <span>·</span>
                            <span className="shrink-0">{article.readCount} 阅</span>
                        </>
                    )}
                </div>

                <div className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-orange-600 transition-transform group-hover:translate-x-0.5 text-[11px]">
                    <span>阅读</span>
                    <ArrowRight className="h-3 w-3" />
                </div>
            </div>
        </Link>
    );
}
