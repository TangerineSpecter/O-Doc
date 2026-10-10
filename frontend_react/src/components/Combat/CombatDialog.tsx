import {useState} from 'react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {useCombat} from '../../hooks/useCombat';
import {useCombatActions} from '../../hooks/useCombatActions';
import {setCombatConfig} from '../../api/combat';
import CombatProfilePanel from './CombatProfilePanel';
import CombatObservation from './CombatObservation';
import {statusLabels} from './presentation';
import {Clock, History, Shield, Sparkles, User} from 'lucide-react';

export default function CombatDialog({
    residents,
    initialAgentId = '',
    explorationId = '',
    onClose,
}: {
    residents: {id: string; name: string}[];
    initialAgentId?: string;
    explorationId?: string;
    onClose: () => void;
}) {
    const [actor, setActor] = useState(
        residents.some(r => r.id === initialAgentId) ? initialAgentId : residents[0]?.id || ''
    );
    const state = useCombat(actor);
    const actions = useCombatActions(actor, state.reload);
    const [tab, setTab] = useState<'profile' | 'history'>('profile');
    const [observation, setObservation] = useState(explorationId);
    const [configError, setConfigError] = useState('');
    const data = state.data;

    return (
        <WorldDialog
            title="冒险与战斗"
            description="准备出发，探索迷宫，见证居民的历练与成长。"
            size="wide"
            onClose={onClose}
        >
            <div className="flex h-full min-h-0 flex-col gap-3">
                {/* 顶部控制栏 */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/80 p-2.5 border border-slate-100">
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* 居民切换 */}
                        <div className="flex items-center gap-1.5">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                                <User className="h-4 w-4" />
                            </span>
                            <div className="w-44">
                                <Select
                                    menuPortal
                                    value={actor}
                                    options={residents.map(r => ({value: r.id, label: r.name}))}
                                    onChange={id => {
                                        setActor(id);
                                        state.setPage(1);
                                    }}
                                />
                            </div>
                        </div>

                        {/* 自动探索开关 */}
                        {data && (
                            <label className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs text-slate-600 border border-slate-200/70 shadow-2xs cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    className="accent-orange-500 h-3.5 w-3.5 rounded"
                                    checked={data.config.autoEnabled}
                                    onChange={event => {
                                        void setCombatConfig({autoEnabled: event.target.checked})
                                            .then(state.reload)
                                            .catch(e =>
                                                setConfigError(e instanceof Error ? e.message : '自动探索设置失败')
                                            );
                                    }}
                                />
                                <span>本机自动探索（每日上限 {data.config.dailyMinutes} 分钟）</span>
                            </label>
                        )}
                    </div>

                    {/* 视图 Tab 切换 */}
                    <div className="flex gap-1 rounded-full bg-slate-200/70 p-1">
                        <button
                            type="button"
                            aria-pressed={tab === 'profile'}
                            onClick={() => setTab('profile')}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                                tab === 'profile'
                                    ? 'bg-white text-orange-600 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Shield className="w-3.5 h-3.5" />
                            <span>冒险档案</span>
                        </button>
                        <button
                            type="button"
                            aria-pressed={tab === 'history'}
                            onClick={() => setTab('history')}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                                tab === 'history'
                                    ? 'bg-white text-orange-600 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <History className="w-3.5 h-3.5" />
                            <span>探索历史</span>
                        </button>
                    </div>
                </div>

                {/* 错误提示 */}
                {(state.error || actions.error || configError) && (
                    <p role="alert" className="shrink-0 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                        {state.error || actions.error || configError}
                    </p>
                )}

                {/* 成功反馈 */}
                {actions.message && (
                    <p role="status" className="shrink-0 rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-700 border border-emerald-200">
                        {actions.message}
                    </p>
                )}

                {/* 主展示区 */}
                <div className="min-h-0 flex-1">
                    {data ? (
                        tab === 'history' ? (
                            <div className="scrollbar-hide h-full flex flex-col justify-between overflow-y-auto space-y-3">
                                <div className="space-y-2.5">
                                    {data.history?.list.map(run => (
                                        <button
                                            key={run.id}
                                            type="button"
                                            onClick={() => setObservation(run.id)}
                                            className="group block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs transition-all hover:border-orange-300 hover:shadow-xs"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex items-center rounded-md bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700 border border-orange-200/60">
                                                        {statusLabels[run.status] || run.status}
                                                    </span>
                                                    <strong className="text-sm font-semibold text-slate-800 group-hover:text-orange-600">
                                                        时长 {Math.floor(run.elapsedSeconds / 60)} 分钟
                                                    </strong>
                                                </div>
                                                <span className="text-[11px] text-slate-400">
                                                    {new Date(run.createdAt).toLocaleString('zh-CN')}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-xs text-slate-500 line-clamp-2">
                                                {run.result.report || '探索任务已完成，点击查看详细战报与收获'}
                                            </p>
                                        </button>
                                    ))}

                                    {(!data.history?.list || data.history.list.length === 0) && (
                                        <div className="py-16 text-center text-xs text-slate-400">
                                            <Clock className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                                            <span>暂无探索记录，派遣居民出发即可留下第一段历练足迹</span>
                                        </div>
                                    )}
                                </div>

                                {/* 分页 */}
                                {data.history && data.history.total > 20 && (
                                    <div className="pt-2 flex items-center justify-center gap-3 text-xs text-slate-500">
                                        <button
                                            type="button"
                                            disabled={state.page <= 1}
                                            onClick={() => state.setPage(p => p - 1)}
                                            className="rounded-lg bg-slate-100 px-3 py-1 hover:bg-slate-200 disabled:opacity-40"
                                        >
                                            上一页
                                        </button>
                                        <span>第 {state.page} 页</span>
                                        <button
                                            type="button"
                                            disabled={state.page * 20 >= data.history.total}
                                            onClick={() => state.setPage(p => p + 1)}
                                            className="rounded-lg bg-slate-100 px-3 py-1 hover:bg-slate-200 disabled:opacity-40"
                                        >
                                            下一页
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : data.profile ? (
                            <CombatProfilePanel
                                profile={data.profile}
                                catalog={data.catalog}
                                actions={actions}
                                onObserve={setObservation}
                            />
                        ) : (
                            <p className="p-6 text-sm text-slate-500">请选择居民以查看冒险档案。</p>
                        )
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-slate-400 gap-2">
                            <Sparkles className="h-4 w-4 animate-spin text-orange-500" />
                            <span>正在翻开冒险档案…</span>
                        </div>
                    )}
                </div>
            </div>

            {/* 探索观察弹窗 */}
            {observation && (
                <CombatObservation
                    key={observation}
                    id={observation}
                    onClose={() => {
                        setObservation('');
                        state.reload();
                    }}
                />
            )}
        </WorldDialog>
    );
}
