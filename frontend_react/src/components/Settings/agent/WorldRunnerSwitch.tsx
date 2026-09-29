import {useState} from 'react';
import {useWorldLifeConfig} from '@/hooks/useWorldLifeConfig';
import type {AgentConfig} from '@/types/api/setting';
import {Checkbox} from '@/components/common/Checkbox';
import {Select} from '@/components/common/Select';
import WorldDialog from '@/components/AgentWorld/WorldDialog';

export function WorldRunnerSwitch({agents}: {agents: AgentConfig[]}) {
    const {enabled, config, loading, error, refresh, field, toggle, pause, save} = useWorldLifeConfig();
    const [open, setOpen] = useState(false);
    const settings = config?.settings;
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-base font-bold text-slate-900">统一生活运行</h4>
            <button type="button" disabled={!config || loading} onClick={() => setOpen(true)} className="rounded-lg bg-orange-500 px-4 py-2 text-sm text-white disabled:opacity-50">配置生活节奏</button>
        </div>
        <div className="mt-4"><Checkbox checked={enabled} disabled={loading || !config?.migrated} onChange={next => void toggle(next)} label="在本机自动执行居民生活"/></div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">各活动共用行动机会，由居民规划。生活安排参与同步，本机开关不同步；同一世界请选择一台设备执行。</p>
        {settings && <p className="mt-3 text-sm text-slate-600">{settings.agentIds.length} 位居民 · {settings.mode === 'fixed' ? `每 ${settings.intervalMinutes} 分钟一个世界机会` : `每${{daily: '天', weekly: '周', monthly: '月', yearly: '年'}[settings.period]}共 ${settings.count} 次`} · {settings.activeStart}–{settings.activeEnd}</p>}
        {config?.migrated && config.migrationSummary && <p className="mt-2 text-xs text-slate-500">统一生活已接管内置活动 · 转换 {config.migrationSummary.convertedItems} 个旧安排 · {config.migrationSummary.runningItems} 个工作流待核对／接续。升级后请确认配置，再开启本机运行。</p>}
        {!config?.migrated && !loading && <p className="mt-2 text-xs text-orange-600">请先保存统一配置，再开启自动运行。</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}<button type="button" onClick={() => refresh()} className="ml-3 underline">重试</button></p>}
        {open && settings && <WorldDialog title="生活节奏" onClose={() => {setOpen(false); refresh();}}>
            <div className="space-y-5 p-6">
                <p className="text-sm text-slate-500">人数和节奏从下次规划生效；暂停立即生效。次数属于整个世界，均分后余数随机分配。</p>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold text-slate-700"><span>执行方式</span><Select menuPortal value={settings.mode} options={[{value: 'fixed', label: '固定间隔'}, {value: 'random', label: '周期随机次数'}]} onChange={v => field('mode', v as 'fixed' | 'random')}/></label>
                    {settings.mode === 'fixed' ? <label className="space-y-2 text-sm"><span>间隔（分钟）</span><input type="number" min={1} value={settings.intervalMinutes} onChange={e => field('intervalMinutes', Number(e.target.value))} className="w-full rounded-xl border border-slate-200 p-3"/></label> : <>
                        <label className="space-y-2 text-sm"><span>周期</span><Select menuPortal value={settings.period} options={[{value: 'daily', label: '每天'}, {value: 'weekly', label: '每周'}, {value: 'monthly', label: '每月'}, {value: 'yearly', label: '每年'}]} onChange={v => field('period', v as typeof settings.period)}/></label>
                        <label className="space-y-2 text-sm"><span>世界总次数</span><input type="number" min={1} value={settings.count} onChange={e => field('count', Number(e.target.value))} className="w-full rounded-xl border border-slate-200 p-3"/></label>
                    </>}
                    {(['activeStart', 'activeEnd'] as const).map(key => <label key={key} className="space-y-2 text-sm"><span>{key === 'activeStart' ? '活动开始' : '活动结束（全天填 24:00）'}</span><input value={settings[key]} onChange={e => field(key, e.target.value)} placeholder="HH:mm" className="w-full rounded-xl border border-slate-200 p-3"/></label>)}
                    {(['minGapMinutes', 'minRemainingMinutes'] as const).map(key => <label key={key} className="space-y-2 text-sm"><span>{key === 'minGapMinutes' ? '居民行动最小间隔（分钟）' : '新规划最少剩余时间（分钟）'}</span><input type="number" min={1} value={settings[key]} onChange={e => field(key, Number(e.target.value))} className="w-full rounded-xl border border-slate-200 p-3"/></label>)}
                </div>
                <div className="space-y-3"><h5 className="text-sm font-semibold">参与居民</h5>{agents.map(agent => <div key={agent.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                    <Checkbox checked={settings.agentIds.includes(agent.id)} onChange={next => field('agentIds', next ? [...settings.agentIds, agent.id] : settings.agentIds.filter(id => id !== agent.id))} label={agent.name}/>
                    {settings.agentIds.includes(agent.id) && <button type="button" disabled={loading} onClick={() => void pause(agent.id)} className="text-xs text-orange-600">{config.pausedAgents.includes(agent.id) ? '恢复' : '暂停'}</button>}
                </div>)}{!agents.length && <p className="text-sm text-slate-400">暂无居民</p>}</div>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <button type="button" disabled={loading || !settings.agentIds.length} onClick={() => void save().then(saved => {if (saved) setOpen(false);})} className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm text-white disabled:opacity-50">保存生活配置</button>
            </div>
        </WorldDialog>}
    </section>;
}
