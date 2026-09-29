import {useEffect, useState} from 'react';
import {
    Compass,
    Target,
    Sparkles,
    Save,
    Plus,
    Check,
    AlertCircle,
    Flag,
    Calendar,
    ChevronRight,
    RefreshCw,
} from 'lucide-react';
import {getLifeProfile, getLifeGoals, saveLifeProfile} from '../../api/agentLife';
import type {LifeProfile, LifeGoal} from '../../types/api/agentLife';
import LifeGoalEditor from './LifeGoalEditor';
import {goalStatusLabels} from './lifeLabels';

const getGoalBadge = (status: LifeGoal['status']) => {
    switch (status) {
        case 'active':
            return {
                label: '进行中',
                className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
                dotClass: 'bg-emerald-500',
            };
        case 'paused':
            return {
                label: '已暂停',
                className: 'bg-slate-100 text-slate-600 border-slate-200',
                dotClass: 'bg-slate-400',
            };
        case 'completed':
            return {
                label: '已完成',
                className: 'bg-blue-50 text-blue-700 border-blue-200/80',
                dotClass: 'bg-blue-500',
            };
        case 'abandoned':
            return {
                label: '已放弃',
                className: 'bg-rose-50 text-rose-700 border-rose-200/80',
                dotClass: 'bg-rose-400',
            };
        default:
            return {
                label: goalStatusLabels[status] || status,
                className: 'bg-slate-100 text-slate-700 border-slate-200',
                dotClass: 'bg-slate-400',
            };
    }
};

export default function LifeProfilePanel({actorId}: {actorId: string}) {
    const [profile, setProfile] = useState<LifeProfile | null>(null);
    const [goals, setGoals] = useState<LifeGoal[]>([]);
    const [goalPage, setGoalPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [editing, setEditing] = useState<LifeGoal | 'new' | null>(null);
    const [busy, setBusy] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedNotice, setSavedNotice] = useState(false);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        Promise.all([
            getLifeProfile(actorId, controller.signal),
            getLifeGoals(actorId, controller.signal, 1),
        ])
            .then(([p, g]) => {
                if (!controller.signal.aborted) {
                    setProfile(p);
                    setGoals(g);
                    setGoalPage(1);
                    setHasMore(g.length === 100);
                    setError('');
                }
            })
            .catch((e) => {
                if (!controller.signal.aborted) {
                    setError(e instanceof Error ? e.message : '生活资料加载失败');
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setBusy(false);
                }
            });
        return () => controller.abort();
    }, [actorId, revision]);

    const handleSave = async () => {
        if (!profile) return;
        setSaving(true);
        setError('');
        try {
            await saveLifeProfile(actorId, profile);
            setSavedNotice(true);
            setTimeout(() => setSavedNotice(false), 2000);
        } catch (e) {
            setError(e instanceof Error ? e.message : '保存失败');
        } finally {
            setSaving(false);
        }
    };

    const loadMore = async () => {
        setBusy(true);
        try {
            const values = await getLifeGoals(actorId, undefined, goalPage + 1);
            setGoals((current) => [...current, ...values]);
            setGoalPage((current) => current + 1);
            setHasMore(values.length === 100);
        } catch (e) {
            setError(e instanceof Error ? e.message : '历史目标加载失败');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            {busy && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                    <span>正在同步生活资料与目标…</span>
                </div>
            )}

            {error && (
                <div
                    role="alert"
                    className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                >
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setBusy(true);
                            setRevision((v) => v + 1);
                        }}
                        className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 font-medium underline hover:text-red-900"
                    >
                        <RefreshCw className="h-3 w-3" />
                        重试
                    </button>
                </div>
            )}

            {/* 双栏响应式网格布局：避免横向被无意义撑大 */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5 items-start">
                {/* 左栏：生活偏好与方向 */}
                {profile && (
                    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
                        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 border border-orange-100/80 shadow-2xs">
                                    <Compass className="h-4.5 w-4.5" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                                        生活偏好与方向
                                    </h4>
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                        指导居民在日常调度中的自主决策与活动规划倾向
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3.5">
                            <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
                                <div className="flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                                    <span>生活偏好</span>
                                </div>
                                <textarea
                                    rows={3}
                                    value={profile.preferences}
                                    onChange={(e) =>
                                        setProfile({...profile, preferences: e.target.value})
                                    }
                                    placeholder="例如：喜欢旅行探索、偏好稳健投资、重视农场经营…"
                                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all leading-relaxed"
                                />
                            </label>

                            <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
                                <div className="flex items-center gap-1.5">
                                    <Target className="h-3.5 w-3.5 text-orange-500" />
                                    <span>生活方向</span>
                                </div>
                                <textarea
                                    rows={3}
                                    value={profile.direction}
                                    onChange={(e) =>
                                        setProfile({...profile, direction: e.target.value})
                                    }
                                    placeholder="例如：希望有更多闲暇时间、发展手工艺、提高自给率…"
                                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all leading-relaxed"
                                />
                            </label>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <span className="text-[11px] text-slate-400">
                                {savedNotice ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                        <Check className="h-3 w-3" />
                                        已保存更新
                                    </span>
                                ) : (
                                    '设置将作为后续活动规划的重要参考'
                                )}
                            </span>
                            <button
                                type="button"
                                disabled={busy || saving}
                                onClick={() => void handleSave()}
                                className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-xs shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {saving ? (
                                    <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                                ) : (
                                    <Save className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <span>{saving ? '保存中…' : '保存生活资料'}</span>
                            </button>
                        </div>
                    </section>
                )}

                {/* 右栏：远期生活目标 */}
                {profile && (
                    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100/80 shadow-2xs">
                                    <Flag className="h-4.5 w-4.5" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                                        远期生活目标
                                    </h4>
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                        居民阶段性里程碑与自动达成条件追踪
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditing('new')}
                                className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-xl bg-orange-50 border border-orange-200/80 px-3 py-1.5 text-xs font-semibold text-orange-600 shadow-2xs hover:bg-orange-100 active:scale-95 transition-all"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span>新增目标</span>
                            </button>
                        </div>

                        {/* 目标列表区 */}
                        <div className="space-y-2.5 max-h-[calc(88vh-260px)] min-h-[180px] overflow-y-auto pr-0.5">
                            {!goals.length ? (
                                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 py-12 px-4 text-center">
                                    <Calendar className="h-7 w-7 text-slate-300" />
                                    <h5 className="mt-2 text-xs font-semibold text-slate-700">
                                        暂无远期生活目标
                                    </h5>
                                    <p className="mt-1 text-[11px] text-slate-400 max-w-xs">
                                        暂未设定目标时，居民仍可根据性格和偏好自主规划。可点击右上角添加里程碑。
                                    </p>
                                </div>
                            ) : (
                                goals.map((goal) => {
                                    const badge = getGoalBadge(goal.status);
                                    return (
                                        <button
                                            key={goal.id}
                                            type="button"
                                            onClick={() => setEditing(goal)}
                                            className="group block w-full rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-left transition-all hover:bg-white hover:border-orange-300 hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-semibold text-xs text-slate-800 group-hover:text-orange-600 transition-colors">
                                                    {goal.title}
                                                </span>
                                                <span
                                                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${badge.className}`}
                                                >
                                                    <span
                                                        className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`}
                                                    />
                                                    {badge.label}
                                                </span>
                                            </div>

                                            <div className="mt-2 rounded-lg bg-white/80 p-2 text-xs text-slate-600 border border-slate-200/60 flex items-center justify-between">
                                                <span className="truncate text-[11px]">
                                                    {goal.progress ||
                                                        goal.condition.description ||
                                                        '尚未记录最新进展'}
                                                </span>
                                                <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-slate-400 group-hover:text-orange-500 font-medium">
                                                    <span>编辑</span>
                                                    <ChevronRight className="h-3 w-3" />
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {hasMore && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void loadMore()}
                                className="w-full rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 shadow-2xs hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50"
                            >
                                加载更多历史目标
                            </button>
                        )}
                    </section>
                )}
            </div>

            {/* 目标编辑模态弹窗 */}
            {editing && (
                <LifeGoalEditor
                    actorId={actorId}
                    goal={editing === 'new' ? undefined : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        setBusy(true);
                        setRevision((v) => v + 1);
                    }}
                />
            )}
        </div>
    );
}
