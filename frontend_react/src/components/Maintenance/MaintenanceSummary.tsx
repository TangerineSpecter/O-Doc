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
        return <div className="mb-6 flex h-28 items-center justify-center rounded-2xl border border-orange-100 bg-white text-orange-500"><Loader2 className="h-5 w-5 animate-spin"/></div>;
    }
    if (!overview) return null;

    const progress = overview.review.total ? Math.round((overview.review.handled / overview.review.total) * 100) : 0;
    return (
        <section className="relative mb-6 overflow-hidden rounded-2xl border border-orange-100 bg-[linear-gradient(115deg,#fffaf3_0%,#ffffff_48%,#f7fee7_100%)] p-5 shadow-sm">
            <div className="absolute -right-10 -top-14 h-36 w-36 rounded-full border-[22px] border-orange-100/50"/>
            <div className="relative grid gap-5 lg:grid-cols-[1.35fr_.8fr_auto] lg:items-center">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-200"><Sunrise className="h-5 w-5"/></div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">今日知识回顾</p>
                        <h2 className="mt-1 text-lg font-bold text-slate-900">{overview.review.leadItem?.title || '今天的知识已经整理好了'}</h2>
                        <p className="mt-1 line-clamp-1 text-sm text-slate-500">{overview.review.leadItem?.reasonText || '没有待处理卡片，可以去健康检查看看。'}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white bg-white/80 p-3 shadow-sm">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500"/>今日进度</div>
                        <p className="mt-1 text-xl font-black text-slate-900">{overview.review.handled}<span className="text-sm font-medium text-slate-400"> / {overview.review.total}</span></p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{width: `${progress}%`}}/></div>
                    </div>
                    <div className="rounded-xl border border-white bg-white/80 p-3 shadow-sm">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><HeartPulse className="h-3.5 w-3.5 text-orange-500"/>知识健康</div>
                        <p className="mt-1 text-xl font-black text-slate-900">{overview.health.score}<span className="text-sm font-medium text-slate-400"> 分</span></p>
                        <p className="mt-1 text-[11px] text-slate-400">{overview.health.status} · {overview.health.total} 项待处理</p>
                    </div>
                </div>
                <button type="button" onClick={onOpen} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 hover:bg-orange-600">
                    开始整理<ArrowRight className="h-4 w-4"/>
                </button>
            </div>
        </section>
    );
}

