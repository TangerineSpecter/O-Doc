import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
    Activity, AlertTriangle, ArrowLeft, BookMarked, Check, CheckCircle2, ChevronLeft, ChevronRight,
    CircleAlert, HeartPulse, Loader2, RefreshCw, ShieldCheck, Sparkles,
} from 'lucide-react';
import {
    getDailyReview, getHealthCheck, ignoreHealthIssue, refreshDailyReview,
    unignoreHealthIssue, updateDailyReviewItem,
} from '../api/maintenance';
import {syncArticleToRag} from '../api/rag';
import ReviewCard from '../components/Maintenance/ReviewCard';
import ReviewReaderModal from '../components/Maintenance/ReviewReaderModal';
import MaintenanceHealthDashboard from '../components/Maintenance/MaintenanceHealthDashboard';
import {Select} from '../components/common/Select';
import {useToast} from '../components/common/ToastProvider';
import type {
    DailyReviewItem, DailyReviewPayload, HealthIssue, HealthPayload, HealthSeverity,
    MaintenanceTarget, ReviewStatus,
} from '../types/api/maintenance';


type ActiveTab = 'review' | 'health';

const severityConfig = {
    critical: {label: '需处理', color: 'bg-rose-50 text-rose-700 ring-rose-100', icon: CircleAlert},
    warning: {label: '建议关注', color: 'bg-amber-50 text-amber-700 ring-amber-100', icon: AlertTriangle},
    info: {label: '待整理', color: 'bg-sky-50 text-sky-700 ring-sky-100', icon: Activity},
};

const ruleLabels: Record<string, string> = {
    article_empty: '正文为空', article_uncategorized: '未分类', article_untagged: '文章无标签',
    memo_untagged: '闪念无标签', rag_pending: 'RAG 未同步', asset_missing: '文件缺失', asset_unlinked: '资源未关联',
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function MaintenancePage() {
    const navigate = useNavigate();
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<ActiveTab>('review');
    const [review, setReview] = useState<DailyReviewPayload | null>(null);
    const [reviewDate, setReviewDate] = useState(dateKey(new Date()));
    const [reviewLoading, setReviewLoading] = useState(true);
    const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [health, setHealth] = useState<HealthPayload | null>(null);
    const [healthLoading, setHealthLoading] = useState(true);
    const [severity, setSeverity] = useState<HealthSeverity | ''>('');
    const [ruleCode, setRuleCode] = useState('');
    const [includeIgnored, setIncludeIgnored] = useState(false);
    const [healthPage, setHealthPage] = useState(1);
    const [healthBusyKey, setHealthBusyKey] = useState<string | null>(null);
    const [readerItem, setReaderItem] = useState<DailyReviewItem | null>(null);
    const reviewRequestRef = useRef(0);
    const healthRequestRef = useRef(0);

    const today = dateKey(new Date());
    const isToday = reviewDate === today;
    const historyDates = useMemo(() => Array.from({length: 7}, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - index);
        return dateKey(date);
    }), []);
    const dateOptions = useMemo(() => historyDates.map((date, index) => ({
        value: date,
        label: index === 0 ? '今天' : index === 1 ? '昨天' : date,
    })), [historyDates]);

    const loadReview = useCallback(async (selectedDate: string) => {
        const requestId = ++reviewRequestRef.current;
        setReviewLoading(true);
        try {
            const data = await getDailyReview(selectedDate);
            if (requestId === reviewRequestRef.current) setReview(data);
        } catch {
            if (requestId === reviewRequestRef.current) toast.error('每日回顾加载失败');
        } finally {
            if (requestId === reviewRequestRef.current) setReviewLoading(false);
        }
    }, [toast]);

    const loadHealth = useCallback(async () => {
        const requestId = ++healthRequestRef.current;
        setHealthLoading(true);
        try {
            const data = await getHealthCheck({
                severity: severity || undefined,
                ruleCode: ruleCode || undefined,
                includeIgnored,
                page: healthPage,
                pageSize: 12,
            });
            if (requestId === healthRequestRef.current) setHealth(data);
        } catch {
            if (requestId === healthRequestRef.current) toast.error('健康检查加载失败');
        } finally {
            if (requestId === healthRequestRef.current) setHealthLoading(false);
        }
    }, [healthPage, includeIgnored, ruleCode, severity, toast]);

    useEffect(() => { void loadReview(reviewDate); }, [loadReview, reviewDate]);
    useEffect(() => { void loadHealth(); }, [loadHealth]);

    const openTarget = (target: MaintenanceTarget) => {
        const params = target.params;
        if (target.view === 'article') navigate(`/article/${params.collId}/${params.articleId}`);
        else if (target.view === 'editor') navigate(`/editor/${params.articleId}`);
        else if (target.view === 'memos') navigate(`/memos?memoId=${encodeURIComponent(params.memoId)}`);
        else if (target.view === 'book') navigate(`/books/${params.collId}?bookId=${encodeURIComponent(params.bookId)}`);
        else if (target.view === 'resources') navigate(`/resources?${new URLSearchParams(params).toString()}`);
    };

    const handleReviewOpen = (item: DailyReviewItem) => setReaderItem(item);
    const closeReader = useCallback(() => setReaderItem(null), []);

    const handleStatusChange = async (item: DailyReviewItem, status: ReviewStatus) => {
        setReviewBusyId(item.id);
        try {
            const updated = await updateDailyReviewItem(item.id, status);
            setReview(updated);
            setReaderItem(current => current && current.id === item.id ? {...current, status} : current);
        } catch {
            toast.error('回顾状态更新失败');
        } finally {
            setReviewBusyId(null);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            setReview(await refreshDailyReview());
            toast.success('已换一批内容');
        } catch {
            toast.error('暂时没有更多可推荐的内容');
        } finally {
            setRefreshing(false);
        }
    };

    const handleIssueAction = async (issue: HealthIssue) => {
        if (issue.action.type === 'navigate' && issue.action.target) {
            openTarget(issue.action.target);
            return;
        }
        if (issue.action.type === 'rag_sync' && issue.action.articleId) {
            setHealthBusyKey(issue.issueKey);
            try {
                await syncArticleToRag(issue.action.articleId);
                toast.success('文章已同步到知识库');
                await loadHealth();
            } catch {
                toast.error('RAG 同步失败');
            } finally {
                setHealthBusyKey(null);
            }
        }
    };

    const handleIgnore = async (issue: HealthIssue) => {
        setHealthBusyKey(issue.issueKey);
        try {
            if (issue.ignored) {
                await unignoreHealthIssue({ruleCode: issue.ruleCode, sourceType: issue.sourceType, sourceId: issue.sourceId});
                toast.success('已恢复显示');
            } else {
                await ignoreHealthIssue({ruleCode: issue.ruleCode, sourceType: issue.sourceType, sourceId: issue.sourceId, fingerprint: issue.fingerprint});
                toast.success('内容变化前将不再提示');
            }
            await loadHealth();
        } catch {
            toast.error('忽略状态更新失败');
        } finally {
            setHealthBusyKey(null);
        }
    };

    const progress = review?.total ? Math.round((review.handled / review.total) * 100) : 0;
    const totalPages = health ? Math.max(1, Math.ceil(health.total / health.pageSize)) : 1;

    return (
        <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_12%_0%,#fff1dd,transparent_28%),radial-gradient(circle_at_88%_12%,#ecfccb,transparent_24%)] px-4 py-7 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
                <button type="button" onClick={() => navigate('/')} className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-orange-600"><ArrowLeft className="h-3.5 w-3.5"/>返回首页</button>

                <header className="relative overflow-hidden rounded-[1.75rem] bg-slate-950 px-6 py-7 text-white shadow-2xl shadow-slate-300 sm:px-8">
                    <div className="absolute right-0 top-0 h-full w-2/5 bg-[radial-gradient(circle_at_center,rgba(251,146,60,.28),transparent_60%)]"/>
                    <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wider text-orange-200 ring-1 ring-white/10"><Sparkles className="h-3.5 w-3.5"/>KNOWLEDGE CARE</div>
                            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">知识维护</h1>
                            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">让旧内容重新浮现，也让知识库中需要整理的角落清晰可见。</p>
                        </div>
                        <div className="flex gap-3">
                            <div className="min-w-28 rounded-2xl bg-white/10 p-3 ring-1 ring-white/10"><p className="text-[11px] text-slate-400">连续完成</p><p className="mt-1 text-2xl font-black">{review?.streak || 0}<span className="ml-1 text-xs font-medium text-slate-400">天</span></p></div>
                            <div className="min-w-28 rounded-2xl bg-orange-500 p-3 shadow-lg shadow-orange-950/30"><p className="text-[11px] text-orange-100">健康分</p><p className="mt-1 text-2xl font-black">{health?.score ?? '--'}<span className="ml-1 text-xs font-medium text-orange-100">分</span></p></div>
                        </div>
                    </div>
                </header>

                <div className="mt-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    <button type="button" onClick={() => setActiveTab('review')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${activeTab === 'review' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><BookMarked className="h-4 w-4"/>今日回顾</button>
                    <button type="button" onClick={() => setActiveTab('health')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${activeTab === 'health' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><HeartPulse className="h-4 w-4"/>健康检查</button>
                </div>

                {activeTab === 'review' ? (
                    <section className="mt-6">
                        <div className="mb-5 flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
                            <div className="flex items-center gap-4">
                                <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-100"><span className="text-sm font-black text-slate-800">{progress}%</span><div className="absolute inset-0 rounded-full border-4 border-orange-400" style={{clipPath: `inset(${100 - progress}% 0 0 0)`}}/></div>
                                <div><p className="font-bold text-slate-900">{isToday ? '今天的回顾进度' : `${reviewDate} 的回顾`}</p><p className="mt-1 text-sm text-slate-500">已处理 {review?.handled || 0} / {review?.total || 0} 张卡片</p></div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="w-32">
                                    <Select
                                        value={reviewDate}
                                        options={dateOptions}
                                        onChange={setReviewDate}
                                        buttonClassName="!min-h-[34px] !h-[34px] px-2.5 !py-1 text-xs font-semibold rounded-lg bg-slate-50 border-slate-200 hover:border-slate-300"
                                        menuClassName="w-36 right-0 z-40"
                                        showSelectedDescription={false}
                                    />
                                </div>
                                {isToday && <button type="button" disabled={refreshing || !review?.pending} onClick={handleRefresh} className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-bold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}/>换一批</button>}
                            </div>
                        </div>
                        {reviewLoading ? <div className="flex h-56 items-center justify-center text-orange-500"><Loader2 className="h-6 w-6 animate-spin"/></div> : review?.items.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                {review.items.map(item => (
                                    <ReviewCard
                                        key={item.id}
                                        item={item}
                                        readonly={!isToday}
                                        busy={reviewBusyId === item.id}
                                        onOpen={handleReviewOpen}
                                        onStatusChange={handleStatusChange}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 py-20 text-center"><ShieldCheck className="mx-auto h-9 w-9 text-emerald-500"/><p className="mt-3 font-bold text-slate-700">这一天没有回顾卡片</p><p className="mt-1 text-sm text-slate-400">继续积累内容，之后再来看看。</p></div>
                        )}
                    </section>
                ) : (
                    <section className="mt-6">
                        <MaintenanceHealthDashboard
                            health={health}
                            loading={healthLoading}
                            selectedSeverity={severity}
                            onSelectSeverity={level => {
                                setSeverity(level);
                                setHealthPage(1);
                            }}
                        />

                        <div className="mt-5 flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
                            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => {setRuleCode(''); setHealthPage(1);}} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!ruleCode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>全部规则</button>{Object.entries(ruleLabels).map(([code, label]) => <button type="button" key={code} onClick={() => {setRuleCode(code); setHealthPage(1);}} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${ruleCode === code ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-orange-50 hover:text-orange-700'}`}>{label}</button>)}</div>
                            <button
                                type="button"
                                onClick={() => {
                                    setIncludeIgnored(current => !current);
                                    setHealthPage(1);
                                }}
                                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                    includeIgnored
                                        ? 'border border-orange-200 bg-orange-50/70 text-orange-700'
                                        : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                <span
                                    className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                                        includeIgnored
                                            ? 'border-orange-500 bg-orange-500 text-white'
                                            : 'border-slate-300 bg-white'
                                    }`}
                                >
                                    {includeIgnored && <Check className="h-3 w-3 stroke-[3]" />}
                                </span>
                                <span>显示已忽略</span>
                            </button>
                        </div>

                        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            {healthLoading ? <div className="flex h-56 items-center justify-center text-orange-500"><Loader2 className="h-6 w-6 animate-spin"/></div> : health?.items.length ? health.items.map(issue => { const config = severityConfig[issue.severity]; const Icon = config.icon; const busy = healthBusyKey === issue.issueKey; return (
                                <div key={issue.issueKey} className={`flex flex-col gap-4 border-b border-slate-100 p-5 last:border-b-0 sm:flex-row sm:items-center ${issue.ignored ? 'bg-slate-50 opacity-65' : ''}`}>
                                    <span className={`self-start rounded-xl p-2.5 ring-1 ${config.color}`}><Icon className="h-4 w-4"/></span>
                                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold text-slate-850">{issue.title}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{issue.ruleTitle}</span>{issue.ignored && <span className="text-[10px] font-bold text-slate-400">已忽略</span>}</div><p className="mt-1 text-sm text-slate-500">{issue.description}</p></div>
                                    <div className="flex shrink-0 gap-2"><button type="button" disabled={busy} onClick={() => handleIgnore(issue)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50">{issue.ignored ? '恢复显示' : '忽略'}</button>{!issue.ignored && <button type="button" disabled={busy} onClick={() => handleIssueAction(issue)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <CheckCircle2 className="h-3.5 w-3.5"/>}去处理</button>}</div>
                                </div>
                            ); }) : <div className="py-20 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-emerald-500"/><p className="mt-3 font-bold text-slate-700">当前筛选下没有问题</p><p className="mt-1 text-sm text-slate-400">知识库状态很不错。</p></div>}
                        </div>
                        {health && totalPages > 1 && <div className="mt-4 flex items-center justify-center gap-3"><button type="button" disabled={healthPage <= 1} onClick={() => setHealthPage(page => page - 1)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-40"><ChevronLeft className="h-4 w-4"/></button><span className="text-xs font-semibold text-slate-500">{healthPage} / {totalPages}</span><button type="button" disabled={healthPage >= totalPages} onClick={() => setHealthPage(page => page + 1)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-40"><ChevronRight className="h-4 w-4"/></button></div>}
                    </section>
                )}
            </div>
            {readerItem && (
                <ReviewReaderModal
                    key={readerItem.id}
                    item={readerItem}
                    onClose={closeReader}
                    onStatusChange={handleStatusChange}
                    onNavigate={openTarget}
                    readonly={!isToday}
                    busy={reviewBusyId === readerItem.id}
                />
            )}
        </main>
    );
}
