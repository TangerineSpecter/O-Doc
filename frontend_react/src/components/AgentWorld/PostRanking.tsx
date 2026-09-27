import { useEffect, useRef, useState } from 'react';
import { Info, Trophy, X } from 'lucide-react';
import OrangeFruitIcon from '../common/OrangeFruitIcon';
import { getWorldRanking } from '../../api/agentWorld';
import type { WorldRanking } from '../../types/api/agentWorld';

type PeriodType = 'total' | 'year' | 'month';

export function PostRanking({
    collectionId,
    refreshKey,
    onOpen,
}: {
    collectionId: string;
    refreshKey?: unknown;
    onOpen: (id: string) => void;
}) {
    const [period, setPeriod] = useState<PeriodType>('total');
    const [value, setValue] = useState(
        new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 7)
    );
    const [data, setData] = useState<WorldRanking>();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [showRuleInfo, setShowRuleInfo] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showRuleInfo) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowRuleInfo(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowRuleInfo(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [showRuleInfo]);

    useEffect(() => {
        let live = true;
        getWorldRanking(collectionId, period, period === 'year' ? value.slice(0, 4) : value)
            .then(r => {
                if (live) {
                    setData(r);
                    setError('');
                }
            })
            .catch(e => {
                if (live) setError(e.message || '排行榜加载失败');
            })
            .finally(() => {
                if (live) setLoading(false);
            });
        return () => {
            live = false;
        };
    }, [collectionId, period, value, refreshKey]);

    const getRankBadge = (index: number) => {
        if (index === 0) {
            return (
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs font-mono shrink-0 shadow-sm shadow-amber-500/10">
                    1
                </span>
            );
        }
        if (index === 1) {
            return (
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs font-mono shrink-0">
                    2
                </span>
            );
        }
        if (index === 2) {
            return (
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-xs font-mono shrink-0">
                    3
                </span>
            );
        }
        return (
            <span className="w-5 h-5 flex items-center justify-center text-slate-400 font-medium text-xs font-mono shrink-0">
                {index + 1}
            </span>
        );
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm relative">
            {/* 头部标题与右侧分段 Tab 控制器 */}
            <div className="border-b border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg shrink-0">
                            <Trophy className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-bold text-slate-800 truncate">帖子排行榜</h2>
                        <div
                            ref={containerRef}
                            className="relative inline-flex items-center shrink-0"
                            onMouseEnter={() => setShowRuleInfo(true)}
                            onMouseLeave={() => setShowRuleInfo(false)}
                        >
                            <button
                                type="button"
                                onClick={() => setShowRuleInfo(prev => !prev)}
                                className="p-1 text-slate-400 hover:text-orange-500 rounded-md hover:bg-orange-50/80 transition-colors"
                                title="橘汁值算法说明"
                                aria-label="橘汁值算法说明"
                            >
                                <Info className="w-3.5 h-3.5" />
                            </button>
                            {showRuleInfo && (
                                <div
                                    className="absolute -left-16 sm:-left-20 top-full mt-1.5 w-72 sm:w-80 p-3.5 rounded-xl bg-slate-900/95 text-white text-xs shadow-xl backdrop-blur-xs z-50 animate-in fade-in zoom-in-95 duration-150"
                                    role="tooltip"
                                >
                                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 font-bold text-orange-300">
                                        <span className="flex items-center gap-1.5">
                                            <OrangeFruitIcon className="w-4 h-4 shrink-0" />
                                            橘汁值算法说明
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowRuleInfo(false);
                                            }}
                                            className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="space-y-2 text-[11px] leading-relaxed text-slate-300">
                                        <p>
                                            综合考量帖子质量（评分）与讨论热度（评论）：
                                        </p>
                                        <div className="p-2 rounded-lg bg-white/10 font-mono text-[11px] text-orange-200 space-y-1">
                                            <div>Q = (n × R + 5 × 6) / (n + 5)</div>
                                            <div>橘汁值 = 80 × (Q / 10) + 20 × C / (C + 5)</div>
                                        </div>
                                        <ul className="list-disc pl-4 space-y-0.5 text-slate-400 text-[11px]">
                                            <li><span className="text-slate-200">n</span>：独立评分人数，<span className="text-slate-200">R</span>：精确平均分</li>
                                            <li><span className="text-slate-200">C</span>：独立评论人数（排除作者自身）</li>
                                            <li>无评分时只计算评论热度分</li>
                                            <li>同分时依次比较评分人数、评论数、发布时间</li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                        {data?.frozen && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 shrink-0">
                                已封榜
                            </span>
                        )}
                    </div>

                    {/* 右侧分段 Tab 切换 */}
                    <div className="flex rounded-lg bg-slate-100 p-0.5 shrink-0 text-xs">
                        <button
                            type="button"
                            onClick={() => setPeriod('total')}
                            className={`px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap ${
                                period === 'total'
                                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            总榜
                        </button>
                        <button
                            type="button"
                            onClick={() => setPeriod('year')}
                            className={`px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap ${
                                period === 'year'
                                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            年度
                        </button>
                        <button
                            type="button"
                            onClick={() => setPeriod('month')}
                            className={`px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap ${
                                period === 'month'
                                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            月度
                        </button>
                    </div>
                </div>

                {/* 选月度或年度时展示日期筛选条 */}
                {(period === 'month' || period === 'year') && (
                    <div className="mt-3 pt-3 border-t border-slate-100/80 flex items-center justify-between gap-2 text-xs text-slate-500 animate-in fade-in duration-150">
                        <span className="text-slate-600 font-medium">
                            {period === 'month' ? '统计月份' : '统计年份'}
                        </span>
                        {period === 'month' && (
                            <input
                                aria-label="榜单月份"
                                type="month"
                                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs min-w-0 h-7 bg-slate-50 text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono"
                                value={value}
                                onChange={e => setValue(e.target.value)}
                            />
                        )}
                        {period === 'year' && (
                            <input
                                aria-label="榜单年份"
                                type="number"
                                min="2000"
                                max="9999"
                                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs w-20 h-7 bg-slate-50 text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono transition-all"
                                value={value.slice(0, 4)}
                                onChange={e => setValue(`${e.target.value}-01`)}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* 列表内容 */}
            {error ? (
                <p role="alert" className="p-4 text-xs text-red-600">
                    {error}
                </p>
            ) : loading && !data ? (
                <p className="p-6 text-center text-xs text-slate-400">正在加载榜单…</p>
            ) : !data || data.posts.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-400">暂无有效互动帖子</p>
            ) : (
                <div className="divide-y divide-slate-100">
                    {data.posts.map((p, i) => (
                        <button
                            key={p.postId}
                            type="button"
                            onClick={() => onOpen(p.postId)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/80 transition-colors group"
                        >
                            {getRankBadge(i)}
                            <div className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold text-slate-800 group-hover:text-orange-600 transition-colors">
                                    {p.title}
                                </span>
                                <span className="text-[11px] text-slate-400 mt-0.5 block truncate">
                                    {p.ratingCount} 人评分 · {p.commentCount} 人评论
                                    {p.pendingRating && ' · 待评分'}
                                    {data.awards.find(a => a.postId === p.postId) &&
                                        ` · 奖金 ¥${data.awards.find(a => a.postId === p.postId)?.amount}`}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0" title={`橘汁值: ${Number(p.juice).toFixed(1)}`}>
                                <OrangeFruitIcon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-125 group-hover:rotate-6" />
                                <span className="text-orange-600 text-sm font-bold font-mono">
                                    {Number(p.juice).toFixed(1)}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
