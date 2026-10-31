import { Award, Sparkles } from 'lucide-react';
import { cardClass } from './ui';

export interface QuantSkeletonEntry {
    id?: string;
    title?: string;
    kind?: string;
    createdAt?: string;
    updatedAt?: string;
    preview?: string;
    researchScore?: number | null;
}

export function QuantWorkbenchSkeleton({
    tab = 'report',
    wideMode = false,
    entrySummary,
}: {
    tab?: string;
    wideMode?: boolean;
    entrySummary?: QuantSkeletonEntry | null;
}) {
    return (
        <div
            className="min-h-0 flex-1 overflow-auto p-3 scrollbar-hide sm:p-5 animate-in fade-in duration-200"
            role="status"
            aria-label="研究工作台内容加载中"
        >
            <div
                className={`mx-auto space-y-3 transition-all duration-300 ${
                    wideMode ? 'max-w-[1680px]' : tab === 'report' ? 'max-w-[1480px]' : 'max-w-5xl'
                }`}
            >
                {/* 顶部操作条骨架（仅在 AI 报告页签下展示，与 ReportPanel 像素级对齐） */}
                {tab === 'report' && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 shadow-2xs min-h-[38px]">
                        <div className="flex min-w-0 items-center gap-2">
                            <div className="h-6 w-44 rounded-lg animate-quant-shimmer border border-slate-100" />
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <div className="h-6 w-28 rounded-lg animate-quant-shimmer border border-slate-100" />
                            <div className="h-6 w-24 rounded-lg animate-quant-shimmer border border-slate-100" />
                        </div>
                    </div>
                )}

                {/* 各种页签对应的具体骨架结构 */}
                {tab === 'report' && <ReportSkeleton entrySummary={entrySummary} />}
                {tab === 'notes' && <NotesSkeleton entrySummary={entrySummary} />}
                {tab === 'code' && <CodeSkeleton />}
                {tab === 'backtests' && <BacktestsSkeleton />}
                {tab === 'feedback' && <FeedbackSkeleton />}
                {tab === 'attachments' && <AttachmentsSkeleton />}
            </div>
        </div>
    );
}

/** 1. AI 研究报告高保真骨架（与 ReportEditor 1:1 像素级对齐，彻底消除切换抖动） */
export function ReportSkeleton({ entrySummary }: { entrySummary?: QuantSkeletonEntry | null }) {
    return (
        <section className={`${cardClass} relative overflow-clip !p-4 sm:!p-6`} aria-hidden="true">
            {/* 顶部装饰彩条 */}
            <div className="inset-x-0 top-0 -mx-6 -mt-6 mb-4 h-1 bg-gradient-to-r from-slate-900 via-orange-500 to-amber-400" />

            {/* 顶栏：标签、标题与视图分段控制器 */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                <div className="min-w-0 w-full flex-1 sm:min-w-60 sm:w-auto">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="h-5 w-20 rounded-full animate-quant-shimmer" />
                        {entrySummary?.researchScore !== undefined && entrySummary.researchScore !== null ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-orange-200/80 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                                <Award size={11} />
                                质量分 {entrySummary.researchScore}
                            </span>
                        ) : (
                            <span className="h-5 w-16 rounded-full animate-quant-shimmer" />
                        )}
                        <span className="hidden sm:inline-block h-3.5 w-36 rounded animate-quant-shimmer" />
                    </div>

                    <h2 className="mt-1.5 break-words text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl flex items-center gap-2">
                        {entrySummary?.title ? (
                            <>
                                <span className="truncate">{entrySummary.title}</span>
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-orange-600 animate-pulse">
                                    正在同步报告…
                                </span>
                            </>
                        ) : (
                            <span className="h-6 w-72 rounded-lg animate-quant-shimmer" />
                        )}
                    </h2>
                </div>

                {/* 右侧：阅读模式分段控制器 + 工具按钮骨架 */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-slate-200/80 bg-slate-100/90 p-0.5">
                        <div className="h-7 w-20 rounded-lg bg-white shadow-2xs" />
                        <div className="h-7 w-24 rounded-lg animate-quant-shimmer" />
                    </div>
                    <div className="h-7 w-20 rounded-lg border border-slate-200 bg-slate-50/80 animate-quant-shimmer" />
                    <div className="h-7 w-24 rounded-lg border border-slate-200 bg-slate-50/80 animate-quant-shimmer" />
                </div>
            </div>

            {/* 双栏 Bento 核心看板：左侧 AI 摘要 + 风险预警 + 章节目录，右侧暗黑五维评分矩阵 */}
            <div className="mb-5 grid gap-4 lg:grid-cols-[1.08fr_1fr]">
                {/* 左侧：AI 原稿摘要卡片骨架 */}
                <div className="flex flex-col justify-between gap-4 rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50/60 via-white to-slate-50/60 p-4 shadow-2xs">
                    <div className="space-y-3.5">
                        <div>
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-orange-700 uppercase">
                                    <Sparkles size={13} className="text-orange-500" />
                                    AI 原稿摘要
                                </span>
                                <div className="h-4 w-24 rounded bg-orange-100/60 animate-pulse" />
                            </div>
                            <div className="space-y-2 pt-1">
                                <div className="h-3.5 w-full rounded animate-quant-shimmer" />
                                <div className="h-3.5 w-11/12 rounded animate-quant-shimmer" />
                                <div className="h-3.5 w-4/5 rounded animate-quant-shimmer" />
                            </div>
                        </div>

                        {/* 结构化关键指标速览格 */}
                        <div className="grid grid-cols-3 gap-2.5 pt-1">
                            {['核心逻辑', '参数变量', '已入库因子'].map((label) => (
                                <div key={label} className="rounded-xl border border-orange-200/60 bg-white/80 p-2.5 shadow-2xs space-y-1">
                                    <span className="text-[10px] font-bold text-orange-800/80">{label}</span>
                                    <div className="mt-1 h-5 w-10 rounded animate-quant-shimmer" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 章节速览目录条 */}
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-orange-200/40 pt-3">
                        <span className="text-[11px] font-bold text-slate-400">章节速览：</span>
                        <div className="h-5 w-14 rounded-lg bg-white shadow-2xs animate-quant-shimmer" />
                        <div className="h-5 w-16 rounded-lg bg-white shadow-2xs animate-quant-shimmer" />
                        <div className="h-5 w-14 rounded-lg bg-white shadow-2xs animate-quant-shimmer" />
                    </div>
                </div>

                {/* 右侧：ReportScore 暗黑评分矩阵骨架 */}
                <div className="scroll-mt-24 flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                        <div className="flex min-w-0 items-center gap-3.5">
                            {/* 环形分数仪表 */}
                            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                                <div className="h-14 w-14 rounded-full border-4 border-slate-700 border-t-orange-500 animate-spin" />
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <strong className="font-mono text-base font-extrabold tabular-nums leading-none text-white">
                                        {entrySummary?.researchScore ?? '—'}
                                    </strong>
                                    <span className="mt-0.5 whitespace-nowrap font-mono text-[9px] leading-none text-slate-400">
                                        /100
                                    </span>
                                </div>
                            </div>

                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
                                        <Award size={14} className="shrink-0 text-orange-400" />
                                        <span className="truncate">源码质量评价</span>
                                    </span>
                                    <span className="shrink-0 rounded-md border border-orange-500/30 bg-orange-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-orange-300">
                                        五维等权
                                    </span>
                                </div>
                                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">
                                    评价计算逻辑、实现、时序、参数与复用；正在加载评价依据…
                                </p>
                            </div>
                        </div>

                        <div className="hidden sm:inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-400">
                            查看评分说明
                        </div>
                    </div>

                    {/* 5 个维度评分条 */}
                    <div className="mt-3 grid gap-1.5">
                        {[
                            '计算逻辑与架构',
                            '实现严谨性',
                            '时序与因果',
                            '参数与过拟合',
                            '实盘可复用度',
                        ].map((dimension) => (
                            <div
                                key={dimension}
                                className="w-full rounded-xl border border-slate-800 bg-slate-800/60 px-3 py-2 text-left"
                            >
                                <div className="flex items-center justify-between gap-2 text-xs leading-5">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                                        <span className="truncate font-semibold text-slate-200">{dimension}</span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2.5">
                                        <div className="hidden sm:flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map((step) => (
                                                <span
                                                    key={step}
                                                    className="h-1.5 w-4 rounded-full bg-slate-700"
                                                />
                                            ))}
                                        </div>
                                        <span className="inline-flex min-w-[3.5rem] justify-center rounded-md border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-400">
                                            … / 5
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 下方正文 Markdown 卡片骨架 */}
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-6 space-y-5">
                <div className="space-y-3">
                    <div className="h-5 w-40 rounded-md animate-quant-shimmer" />
                    <div className="space-y-2 pt-1">
                        <div className="h-3.5 w-full rounded animate-quant-shimmer" />
                        <div className="h-3.5 w-11/12 rounded animate-quant-shimmer" />
                        <div className="h-3.5 w-4/5 rounded animate-quant-shimmer" />
                    </div>

                    <div className="rounded-lg border border-slate-200/60 bg-slate-100/70 p-3 space-y-1.5 font-mono">
                        <div className="h-3 w-3/4 rounded bg-slate-200/70 animate-pulse" />
                        <div className="h-3 w-1/2 rounded bg-slate-200/60 animate-pulse" />
                    </div>
                </div>

                <div className="space-y-3 pt-2">
                    <div className="h-5 w-48 rounded-md animate-quant-shimmer" />
                    <div className="space-y-2 pt-1">
                        <div className="h-3.5 w-full rounded animate-quant-shimmer" />
                        <div className="h-3.5 w-5/6 rounded animate-quant-shimmer" />
                        <div className="h-3.5 w-3/4 rounded animate-quant-shimmer" />
                    </div>
                </div>
            </div>
        </section>
    );
}

/** 2. 补充笔记高保真骨架 */
function NotesSkeleton({ entrySummary }: { entrySummary?: QuantSkeletonEntry | null }) {
    return (
        <section className={`${cardClass} space-y-4 !p-5`} aria-hidden="true">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="space-y-1">
                    {entrySummary?.title ? (
                        <h2 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                            <span className="truncate">{entrySummary.title} · 补充笔记</span>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-orange-600 animate-pulse">
                                读取中…
                            </span>
                        </h2>
                    ) : (
                        <div className="h-5 w-28 rounded-md animate-quant-shimmer" />
                    )}
                    <div className="h-3 w-44 rounded animate-quant-shimmer" />
                </div>
                <div className="h-8 w-20 rounded-lg animate-quant-shimmer" />
            </div>
            {/* 模拟编辑器工具栏 */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/70 bg-slate-50 p-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-6 w-6 rounded bg-slate-200/60 animate-pulse" />
                ))}
            </div>
            {/* 模拟笔记正文 */}
            <div className="space-y-2.5 pt-2">
                <div className="h-4 w-3/4 rounded animate-quant-shimmer" />
                <div className="h-4 w-full rounded animate-quant-shimmer" />
                <div className="h-4 w-5/6 rounded animate-quant-shimmer" />
                <div className="h-4 w-2/3 rounded animate-quant-shimmer" />
            </div>
        </section>
    );
}

/** 3. 代码实现高保真骨架 */
function CodeSkeleton() {
    return (
        <div className="space-y-5" aria-hidden="true">
            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                        <div className="h-5 w-28 rounded-md animate-quant-shimmer" />
                        <div className="h-3 w-48 rounded animate-quant-shimmer" />
                    </div>
                    <div className="h-8 w-24 rounded-lg animate-quant-shimmer" />
                </div>
                <div className="mt-4 h-9 w-full rounded-lg animate-quant-shimmer" />
            </section>

            {/* 代码编辑器卡片模拟 */}
            <section className={`${cardClass} space-y-3 font-mono`}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="h-4 w-32 rounded bg-slate-200/70 animate-pulse" />
                    <div className="flex gap-2">
                        <div className="h-6 w-16 rounded bg-slate-100 animate-pulse" />
                        <div className="h-6 w-16 rounded bg-slate-100 animate-pulse" />
                    </div>
                </div>
                <div className="space-y-2 pt-2">
                    <div className="flex gap-4">
                        <span className="w-6 text-right text-xs text-slate-300">1</span>
                        <div className="h-3.5 w-48 rounded bg-slate-200/60 animate-pulse" />
                    </div>
                    <div className="flex gap-4">
                        <span className="w-6 text-right text-xs text-slate-300">2</span>
                        <div className="h-3.5 w-64 rounded bg-slate-200/60 animate-pulse" />
                    </div>
                    <div className="flex gap-4">
                        <span className="w-6 text-right text-xs text-slate-300">3</span>
                        <div className="h-3.5 w-36 rounded bg-slate-200/60 animate-pulse" />
                    </div>
                    <div className="flex gap-4">
                        <span className="w-6 text-right text-xs text-slate-300">4</span>
                        <div className="h-3.5 w-80 rounded bg-slate-200/60 animate-pulse" />
                    </div>
                </div>
            </section>
        </div>
    );
}

/** 4. 回测记录高保真骨架 */
function BacktestsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden="true">
            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                        <div className="h-5 w-24 rounded-md animate-quant-shimmer" />
                        <div className="h-3 w-40 rounded animate-quant-shimmer" />
                    </div>
                    <div className="h-8 w-28 rounded-lg animate-quant-shimmer" />
                </div>
            </section>

            {/* 回测卡片列表 */}
            <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                    <article key={i} className={`${cardClass} space-y-3`}>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="h-4 w-36 rounded animate-quant-shimmer" />
                            <div className="h-4 w-20 rounded animate-quant-shimmer" />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {Array.from({ length: 4 }).map((_, j) => (
                                <div key={j} className="rounded-lg bg-slate-50 p-2 space-y-1">
                                    <div className="h-3 w-14 rounded animate-quant-shimmer" />
                                    <div className="h-4 w-10 rounded animate-quant-shimmer" />
                                </div>
                            ))}
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}

/** 5. 使用反馈高保真骨架 */
function FeedbackSkeleton() {
    return (
        <div className="space-y-4" aria-hidden="true">
            <section className={cardClass}>
                <div className="flex items-center justify-between">
                    <div className="h-5 w-24 rounded-md animate-quant-shimmer" />
                    <div className="h-8 w-24 rounded-lg animate-quant-shimmer" />
                </div>
            </section>
            <div className={`${cardClass} space-y-3`}>
                <div className="h-4 w-40 rounded animate-quant-shimmer" />
                <div className="h-3.5 w-full rounded animate-quant-shimmer" />
                <div className="h-3.5 w-4/5 rounded animate-quant-shimmer" />
            </div>
        </div>
    );
}

/** 6. 附件高保真骨架 */
function AttachmentsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden="true">
            <section className={cardClass}>
                <div className="flex items-center justify-between">
                    <div className="h-5 w-24 rounded-md animate-quant-shimmer" />
                    <div className="h-8 w-24 rounded-lg animate-quant-shimmer" />
                </div>
            </section>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className={`${cardClass} flex items-center gap-3`}>
                        <div className="h-10 w-10 rounded-xl bg-slate-100 animate-pulse" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="h-3.5 w-28 rounded animate-quant-shimmer" />
                            <div className="h-3 w-16 rounded animate-quant-shimmer" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
