import {useEffect, useState} from 'react';
import {ArrowRight, CheckCircle2, HeartPulse, Loader2, Sunrise} from 'lucide-react';
import {getMaintenanceOverview} from '../../api/maintenance';
import type {MaintenanceOverview} from '../../types/api/maintenance';

interface MaintenanceSummaryProps {
    onOpen: () => void;
}

export default function MaintenanceSummary({onOpen}: MaintenanceSummaryProps) {
    const [overview, setOverview] = useState<MaintenanceOverview | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        getMaintenanceOverview()
            .then(data => active && setOverview(data))
            .catch(error => console.warn('知识维护摘要加载失败', error))
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, []);

    if (loading) {
        return (
            <>
                <div className="mb-4 flex h-16 items-center justify-center rounded-xl border border-orange-100 bg-white text-orange-500 2xl:hidden"><Loader2 className="h-5 w-5 animate-spin"/></div>
                <aside className="fixed left-4 top-[16.375rem] hidden h-44 w-56 items-center justify-center rounded-2xl border border-orange-100 bg-white text-orange-500 shadow-sm 2xl:flex"><Loader2 className="h-5 w-5 animate-spin"/></aside>
            </>
        );
    }
    if (!overview) return null;

    const progress = overview.review.total ? Math.round((overview.review.handled / overview.review.total) * 100) : 0;

    return (
        <>
            <section className="relative mb-4 overflow-hidden rounded-xl border border-orange-100 bg-[linear-gradient(115deg,#fffaf3_0%,#ffffff_48%,#f7fee7_100%)] px-3 py-3 shadow-sm sm:px-4 2xl:hidden">
                <div className="absolute -right-8 -top-16 h-28 w-28 rounded-full border-[18px] border-orange-100/40"/>
                <div className="relative grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-md shadow-orange-200"><Sunrise className="h-4 w-4"/></div>
                        <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                                <p className="shrink-0 text-[11px] font-bold tracking-[.12em] text-orange-600">今日回顾</p>
                                <span className="h-3 w-px shrink-0 bg-orange-200"/>
                                <h2 className="truncate text-sm font-bold text-slate-900">{overview.review.leadItem?.title || '今天的知识已经整理好了'}</h2>
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-500">{overview.review.leadItem?.reasonText || '没有待处理卡片，可以去健康检查看看。'}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="min-w-32 rounded-lg border border-white bg-white/80 px-3 py-2 shadow-sm">
                            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500"/>进度</span><strong className="text-sm font-black text-slate-900">{overview.review.handled}<span className="font-medium text-slate-400"> / {overview.review.total}</span></strong></div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{width: `${progress}%`}}/></div>
                        </div>
                        <div className="min-w-36 rounded-lg border border-white bg-white/80 px-3 py-2 shadow-sm">
                            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><HeartPulse className="h-3.5 w-3.5 text-orange-500"/>健康</span><strong className="text-sm font-black text-slate-900">{overview.health.score}<span className="font-medium text-slate-400"> 分</span></strong></div>
                            <p className="mt-1 truncate text-[10px] text-slate-400">{overview.health.status} · {overview.health.total} 项待处理</p>
                        </div>
                    </div>
                    <button type="button" onClick={onOpen} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-slate-200 transition hover:-translate-y-0.5 hover:bg-orange-600">
                        去整理<ArrowRight className="h-3.5 w-3.5"/>
                    </button>
                </div>
            </section>

            <aside className="fixed left-4 top-[16.375rem] z-30 hidden w-56 overflow-hidden rounded-2xl border border-orange-100 bg-[linear-gradient(155deg,#ffffff_0%,#fff9ef_68%,#f7fee7_130%)] shadow-sm 2xl:block">
                <div className="flex items-center gap-2.5 border-b border-orange-100/80 px-3.5 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm shadow-orange-200"><Sunrise className="h-4 w-4"/></span>
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-slate-900">今日回顾</h2>
                        <p className="mt-0.5 truncate text-[10px] text-slate-400">今天的知识整理进度</p>
                    </div>
                </div>
                <div className="p-3">
                    <p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-700">{overview.review.leadItem?.title || '今天的知识已经整理好了'}</p>
                    <div className="mt-3 rounded-xl border border-white bg-white/75 p-2.5 shadow-sm">
                        <div className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-1 font-semibold text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500"/>回顾进度</span><strong className="text-slate-900">{overview.review.handled} / {overview.review.total}</strong></div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-400" style={{width: `${progress}%`}}/></div>
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-xl border border-white bg-white/75 px-2.5 py-2 text-[11px] shadow-sm">
                        <span className="flex items-center gap-1 font-semibold text-slate-500"><HeartPulse className="h-3.5 w-3.5 text-orange-500"/>知识健康</span>
                        <strong className="text-slate-900">{overview.health.score} 分</strong>
                    </div>
                    <button type="button" onClick={onOpen} className="group mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30">
                        去整理<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"/>
                    </button>
                </div>
            </aside>
        </>
    );
}
