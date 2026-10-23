import {BookOpen, Flame, Layers, Sparkles} from 'lucide-react';
import type {AnthologyItem, AuthorItem} from './types';
import AgentAvatar from '../AgentAvatar';
import {ProfessionBadge} from '../ProfessionBadge';

interface WorldWorksSidebarProps {
    totalCount: number;
    anthologies: AnthologyItem[];
    authors: AuthorItem[];
    selectedAnthologyId: string | null;
    selectedAuthorName: string | null;
    featuredOnly: boolean;
    onSelectAll: () => void;
    onToggleFeatured: () => void;
    onSelectAnthology: (collId: string | null) => void;
    onSelectAuthor: (authorName: string | null) => void;
}

export default function WorldWorksSidebar({
    totalCount,
    anthologies,
    authors,
    selectedAnthologyId,
    selectedAuthorName,
    featuredOnly,
    onSelectAll,
    onToggleFeatured,
    onSelectAnthology,
    onSelectAuthor,
}: WorldWorksSidebarProps) {
    const isAllActive = !selectedAnthologyId && !selectedAuthorName && !featuredOnly;

    return (
        <>
            {/* 桌面端边栏 (>= lg) */}
            <aside className="hidden lg:flex w-48 shrink-0 flex-col justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 p-2.5">
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide space-y-3">
                    {/* 概览导航分组 */}
                    <div className="space-y-0.5">
                        <div className="px-1.5 pb-1 text-[10px] font-semibold tracking-wider text-slate-400">
                            视图分类
                        </div>

                        {/* 全部作品 */}
                        <button
                            type="button"
                            onClick={onSelectAll}
                            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                                isAllActive
                                    ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                                    : 'text-slate-600 hover:bg-slate-100/90 hover:text-slate-900'
                            }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <Layers className={`h-3.5 w-3.5 shrink-0 ${isAllActive ? 'text-white' : 'text-slate-400'}`} />
                                <span>全部作品</span>
                            </span>
                            <span
                                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                                    isAllActive
                                        ? 'bg-white/20 text-white'
                                        : 'bg-slate-200/70 text-slate-600'
                                }`}
                            >
                                {totalCount}
                            </span>
                        </button>

                        {/* 高分精选 */}
                        <button
                            type="button"
                            onClick={onToggleFeatured}
                            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                                featuredOnly
                                    ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                                    : 'text-slate-600 hover:bg-slate-100/90 hover:text-slate-900'
                            }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <Flame className={`h-3.5 w-3.5 shrink-0 ${featuredOnly ? 'text-white' : 'text-amber-500'}`} />
                                <span>高分热读</span>
                            </span>
                            <span
                                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                                    featuredOnly
                                        ? 'bg-white/20 text-white'
                                        : 'bg-amber-100 text-amber-700'
                                }`}
                            >
                                推荐
                            </span>
                        </button>
                    </div>

                    {/* 文集专栏分组 */}
                    {anthologies.length > 0 && (
                        <div className="space-y-0.5">
                            <div className="flex items-center justify-between px-1.5 pb-1 text-[10px] font-semibold tracking-wider text-slate-400">
                                <span>专栏文集</span>
                                <span className="text-[10px] font-normal text-slate-400">{anthologies.length} 个</span>
                            </div>

                            <div className="space-y-0.5">
                                {anthologies.map(item => {
                                    const active = selectedAnthologyId === item.collId;
                                    return (
                                        <button
                                            key={item.collId}
                                            type="button"
                                            onClick={() => onSelectAnthology(active ? null : item.collId)}
                                            className={`group flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs transition-all ${
                                                active
                                                    ? 'bg-orange-50 text-orange-700 border border-orange-200/80 font-semibold shadow-2xs'
                                                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border border-transparent'
                                            }`}
                                        >
                                            <span className="flex min-w-0 items-center gap-1.5">
                                                <BookOpen
                                                    className={`h-3 w-3 shrink-0 transition-colors ${
                                                        active ? 'text-orange-500' : 'text-slate-400 group-hover:text-slate-600'
                                                    }`}
                                                />
                                                <span className="truncate">{item.title}</span>
                                            </span>
                                            <span
                                                className={`ml-1 shrink-0 rounded-full px-1.5 py-0.2 text-[10px] font-medium ${
                                                    active
                                                        ? 'bg-orange-100 text-orange-700'
                                                        : 'bg-slate-200/60 text-slate-500'
                                                }`}
                                            >
                                                {item.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 居民创作者分组 */}
                    {authors.length > 0 && (
                        <div className="space-y-0.5">
                            <div className="flex items-center justify-between px-1.5 pb-1 text-[10px] font-semibold tracking-wider text-slate-400">
                                <span>创作者居民</span>
                                <span className="text-[10px] font-normal text-slate-400">{authors.length} 位</span>
                            </div>

                            <div className="space-y-0.5">
                                {authors.map(author => {
                                    const active = selectedAuthorName === author.name;
                                    return (
                                        <button
                                            key={author.name}
                                            type="button"
                                            onClick={() => onSelectAuthor(active ? null : author.name)}
                                            className={`group flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-xs transition-all ${
                                                active
                                                    ? 'bg-orange-50 text-orange-700 border border-orange-200/80 font-semibold shadow-2xs'
                                                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border border-transparent'
                                            }`}
                                        >
                                            <div className="flex min-w-0 items-center gap-1.5">
                                                <AgentAvatar name={author.name} avatar={author.avatar} size="xs" />
                                                <div className="truncate font-medium">{author.name}</div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {author.profession && (
                                                    <span className="scale-75 origin-right">
                                                        <ProfessionBadge
                                                            professionName={author.profession}
                                                            size="xs"
                                                            variant="purple"
                                                            showIcon={false}
                                                        />
                                                    </span>
                                                )}
                                                <span
                                                    className={`shrink-0 rounded-full px-1.5 py-0.2 text-[10px] font-medium ${
                                                        active
                                                            ? 'bg-orange-100 text-orange-700'
                                                            : 'bg-slate-200/60 text-slate-500'
                                                    }`}
                                                >
                                                    {author.count}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* 底部轻提示 */}
                <div className="mt-2 shrink-0 rounded-lg border border-orange-100/80 bg-orange-50/50 p-2 text-[10px] leading-snug text-orange-800">
                    <div className="flex items-center gap-1 font-semibold text-orange-900">
                        <Sparkles className="h-2.5 w-2.5 text-orange-500" />
                        <span>灵感阅览室</span>
                    </div>
                    <p className="mt-0.5 text-[9px] text-orange-700/80">
                        智能体日常探索与行动的专栏心得。
                    </p>
                </div>
            </aside>

            {/* 移动端/窄屏水平快速胶囊栏 (< lg) */}
            <div className="lg:hidden shrink-0 mb-2.5 overflow-x-auto scrollbar-hide py-0.5">
                <div className="flex items-center gap-1.5">
                    {/* 全部 */}
                    <button
                        type="button"
                        onClick={onSelectAll}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                            isAllActive
                                ? 'bg-orange-500 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        <span>全部</span>
                        <span className="rounded-full bg-black/10 px-1 text-[10px]">{totalCount}</span>
                    </button>

                    {/* 精选 */}
                    <button
                        type="button"
                        onClick={onToggleFeatured}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                            featuredOnly
                                ? 'bg-orange-500 text-white shadow-2xs'
                                : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                        }`}
                    >
                        <Flame className="h-3 w-3" />
                        <span>高分精选</span>
                    </button>

                    {/* 文集胶囊 */}
                    {anthologies.map(item => {
                        const active = selectedAnthologyId === item.collId;
                        return (
                            <button
                                key={item.collId}
                                type="button"
                                onClick={() => onSelectAnthology(active ? null : item.collId)}
                                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                                    active
                                        ? 'bg-orange-500 text-white shadow-2xs'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                <BookOpen className="h-3 w-3" />
                                <span className="max-w-[100px] truncate">{item.title}</span>
                                <span className="rounded-full bg-black/10 px-1 text-[10px]">{item.count}</span>
                            </button>
                        );
                    })}

                    {/* 作者胶囊 */}
                    {authors.map(author => {
                        const active = selectedAuthorName === author.name;
                        return (
                            <button
                                key={author.name}
                                type="button"
                                onClick={() => onSelectAuthor(active ? null : author.name)}
                                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                                    active
                                        ? 'bg-orange-500 text-white shadow-2xs'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                <AgentAvatar name={author.name} avatar={author.avatar} size="xs" />
                                <span>{author.name}</span>
                                <span className="rounded-full bg-black/10 px-1 text-[10px]">{author.count}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
