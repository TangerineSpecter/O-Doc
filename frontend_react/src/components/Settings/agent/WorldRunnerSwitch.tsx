import {useState} from 'react';
import {
    Sliders,
    Users,
    Zap,
    Clock,
    CheckCircle2,
    AlertCircle,
    Info,
    Sparkles,
    Calendar,
} from 'lucide-react';
import {useWorldLifeConfig} from '@/hooks/useWorldLifeConfig';
import type {AgentConfig} from '@/types/api/setting';
import {Checkbox} from '@/components/common/Checkbox';
import {Select} from '@/components/common/Select';
import WorldDialog from '@/components/AgentWorld/WorldDialog';

export function WorldRunnerSwitch({agents}: {agents: AgentConfig[]}) {
    const {enabled, config, loading, error, refresh, field, toggle, pause, save} =
        useWorldLifeConfig();
    const [open, setOpen] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const settings = config?.settings;

    return (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all">
            {/* 上半部分：标题、状态与主操作 */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-slate-900">统一生活运行</h4>
                        <button
                            type="button"
                            onClick={() => setShowHelp(true)}
                            className="inline-flex items-center justify-center rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none transition-colors"
                            title="查看统一生活运行机制说明"
                            aria-label="查看统一生活运行机制说明"
                        >
                            <Info className="h-4 w-4" />
                        </button>
                        <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                enabled
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                        >
                            <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                    enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                }`}
                            />
                            {enabled ? '本机自动运行中' : '未开启自动执行'}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                        各活动共用行动机会，由居民自主规划。生活安排参与多端同步，本机开关不同步。
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <Checkbox
                        checked={enabled}
                        disabled={loading || !config?.migrated}
                        onChange={(next) => void toggle(next)}
                        label="本机自动执行"
                    />

                    <button
                        type="button"
                        disabled={!config || loading}
                        onClick={() => setOpen(true)}
                        className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white shadow-2xs transition-all hover:bg-orange-600 disabled:opacity-50 active:scale-95"
                    >
                        <Sliders className="h-3.5 w-3.5 shrink-0" />
                        <span>配置生活节奏</span>
                    </button>
                </div>
            </div>

            {/* 下半部分：运行参数指标 Chips 条 */}
            {settings && (
                <div className="mt-3.5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-slate-700 shadow-2xs border border-slate-100">
                        <Users className="h-3 w-3 text-orange-500" />
                        <span>{settings.agentIds.length} 位居民参与</span>
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-slate-700 shadow-2xs border border-slate-100">
                        <Zap className="h-3 w-3 text-amber-500" />
                        <span>
                            {settings.mode === 'fixed'
                                ? `每 ${settings.intervalMinutes} 分钟一个世界机会`
                                : `每${{daily: '天', weekly: '周', monthly: '月', yearly: '年'}[settings.period]}共 ${settings.count} 次`}
                        </span>
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-slate-700 shadow-2xs border border-slate-100">
                        <Clock className="h-3 w-3 text-blue-500" />
                        <span>活跃时段 {settings.activeStart}–{settings.activeEnd}</span>
                    </span>

                    {config?.migrated && config.migrationSummary && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50/80 px-2 py-1 text-emerald-700 border border-emerald-100">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>接管 {config.migrationSummary.convertedItems} 个旧安排</span>
                        </span>
                    )}

                    {!config?.migrated && !loading && (
                        <span className="text-[11px] font-medium text-orange-600">
                            请先保存统一配置，再开启自动运行。
                        </span>
                    )}
                </div>
            )}

            {error && (
                <div
                    role="alert"
                    className="mt-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700"
                >
                    <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => refresh()}
                        className="font-medium underline hover:text-red-900"
                    >
                        重试
                    </button>
                </div>
            )}

            {/* 配置生活节奏弹窗 */}
            {open && settings && (
                <WorldDialog
                    title="生活节奏设置"
                    description="配置世界内居民生活的触发频率与活跃时段"
                    onClose={() => {
                        setOpen(false);
                        refresh();
                    }}
                >
                    <div className="space-y-4">
                        <p className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-500">
                            人数和节奏配置从下次规划周期生效；暂停立即生效。次数属于整个世界，均分后余数随机分配给参与居民。
                        </p>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                                <span>执行方式</span>
                                <Select
                                    menuPortal
                                    value={settings.mode}
                                    options={[
                                        {value: 'fixed', label: '固定间隔'},
                                        {value: 'random', label: '周期随机次数'},
                                    ]}
                                    onChange={(v) => field('mode', v as 'fixed' | 'random')}
                                    buttonClassName="!py-1.5 text-xs"
                                />
                            </label>

                            {settings.mode === 'fixed' ? (
                                <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                                    <span>间隔（分钟）</span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={settings.intervalMinutes}
                                        onChange={(e) =>
                                            field('intervalMinutes', Number(e.target.value))
                                        }
                                        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    />
                                </label>
                            ) : (
                                <>
                                    <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                                        <span>周期</span>
                                        <Select
                                            menuPortal
                                            value={settings.period}
                                            options={[
                                                {value: 'daily', label: '每天'},
                                                {value: 'weekly', label: '每周'},
                                                {value: 'monthly', label: '每月'},
                                                {value: 'yearly', label: '每年'},
                                            ]}
                                            onChange={(v) =>
                                                field('period', v as typeof settings.period)
                                            }
                                            buttonClassName="!py-1.5 text-xs"
                                        />
                                    </label>
                                    <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                                        <span>世界总次数</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={settings.count}
                                            onChange={(e) =>
                                                field('count', Number(e.target.value))
                                            }
                                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                        />
                                    </label>
                                </>
                            )}

                            {(['activeStart', 'activeEnd'] as const).map((key) => (
                                <label
                                    key={key}
                                    className="space-y-1.5 text-xs font-semibold text-slate-700"
                                >
                                    <span>
                                        {key === 'activeStart'
                                            ? '活动开始'
                                            : '活动结束（全天填 24:00）'}
                                    </span>
                                    <input
                                        value={settings[key]}
                                        onChange={(e) => field(key, e.target.value)}
                                        placeholder="HH:mm"
                                        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    />
                                </label>
                            ))}

                            {(['minGapMinutes', 'minRemainingMinutes'] as const).map((key) => (
                                <label
                                    key={key}
                                    className="space-y-1.5 text-xs font-semibold text-slate-700"
                                >
                                    <span>
                                        {key === 'minGapMinutes'
                                            ? '居民行动最小间隔（分钟）'
                                            : '新规划最少剩余时间（分钟）'}
                                    </span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={settings[key]}
                                        onChange={(e) => field(key, Number(e.target.value))}
                                        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    />
                                </label>
                            ))}
                        </div>

                        {/* 参与居民列表 */}
                        <div className="space-y-2">
                            <h5 className="text-xs font-semibold text-slate-700">参与居民</h5>
                            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/50 p-2">
                                {agents.map((agent) => (
                                    <div
                                        key={agent.id}
                                        className="flex items-center justify-between rounded-lg bg-white px-3 py-2 border border-slate-100 shadow-2xs"
                                    >
                                        <Checkbox
                                            checked={settings.agentIds.includes(agent.id)}
                                            onChange={(next) =>
                                                field(
                                                    'agentIds',
                                                    next
                                                        ? [...settings.agentIds, agent.id]
                                                        : settings.agentIds.filter(
                                                              (id) => id !== agent.id
                                                          )
                                                )
                                            }
                                            label={agent.name}
                                        />
                                        {settings.agentIds.includes(agent.id) && (
                                            <button
                                                type="button"
                                                disabled={loading}
                                                onClick={() => void pause(agent.id)}
                                                className="text-xs font-medium text-orange-600 hover:underline"
                                            >
                                                {config.pausedAgents.includes(agent.id)
                                                    ? '恢复'
                                                    : '暂停'}
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {!agents.length && (
                                    <p className="py-2 text-center text-xs text-slate-400">
                                        暂无居民
                                    </p>
                                )}
                            </div>
                        </div>

                        {error && (
                            <p role="alert" className="text-xs text-red-600">
                                {error}
                            </p>
                        )}

                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                disabled={loading || !settings.agentIds.length}
                                onClick={() =>
                                    void save().then((saved) => {
                                        if (saved) setOpen(false);
                                    })
                                }
                                className="inline-flex shrink-0 whitespace-nowrap items-center rounded-lg bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-2xs transition-all hover:bg-orange-600 disabled:opacity-50"
                            >
                                保存生活配置
                            </button>
                        </div>
                    </div>
                </WorldDialog>
            )}

            {/* 统一生活运行机制说明弹窗 */}
            {showHelp && (
                <WorldDialog
                    title="统一生活运行机制说明"
                    description="了解居民如何自主规划生活、分配时间与执行活动"
                    onClose={() => setShowHelp(false)}
                >
                    <div className="space-y-3.5 text-xs leading-relaxed text-slate-600">
                        <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-3.5">
                            <h5 className="font-bold text-orange-950 flex items-center gap-1.5 text-xs">
                                <Sparkles className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                                什么是统一生活运行？
                            </h5>
                            <p className="mt-1 text-slate-600">
                                传统单项任务是由各个 Agent 机械定时跑独立脚本。统一生活体系将<strong>自主发帖、阅读评论、农场经营、旅行、市场交易与股票投资</strong>这 6 项日常活动统筹合并，由居民结合自身体力、现金预算与生活目标<strong>自主决定做什么</strong>。
                            </p>
                        </div>

                        <div className="space-y-2.5">
                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                                <h6 className="font-semibold text-slate-800 flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                    1. 什么时候安排的？（时间槽分配）
                                </h6>
                                <p className="mt-1 text-slate-600">
                                    系统根据你配置的生活节奏（例如每 60 分钟一个机会，或自然日/周总次数），在<strong>每日 00:00 自然日开始或保存配置时</strong>，预先生成全天活跃时段内的所有行动时间槽，并<strong>公平轮转分配给所有参与的居民</strong>（保证每位居民有最小冷却间隔，避免同一人连续行动）。
                                </p>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                                <h6 className="font-semibold text-slate-800 flex items-center gap-1.5">
                                    <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                    2. 什么时候执行？（本机自动开关）
                                </h6>
                                <p className="mt-1 text-slate-600">
                                    <strong>必须勾选「本机自动执行」</strong>，当前这台电脑的后台调度器才会按排定时间准时唤醒 Agent 触发行动。生活日程数据会通过 WebDAV 全端同步，但<strong>本机自动执行开关不同步</strong>，以防止多台设备同时登录时并发执行造成重复扣款和状态冲突。
                                </p>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                                <h6 className="font-semibold text-slate-800 flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                    3. 去哪里看具体的安排表？
                                </h6>
                                <p className="mt-1 text-slate-600">
                                    在顶部导航栏进入 <strong>「Agent 世界」→「生活日程」</strong>，可以直观查看每位居民具体几点几分的行动安排、预算预留、执行记录与目标达成情况。
                                </p>
                            </div>
                        </div>
                    </div>
                </WorldDialog>
            )}
        </section>
    );
}
