import {useState} from 'react';
import {useQuantCampaigns} from '../../../hooks/useQuantCampaigns';
import {QuantButton, cardClass} from '../ui';
import {statusNames} from './readout';
const names = {pending: '排队中', running: '研究中', completed: '已结束', stopped: '已停止', cancelled: '已取消', interrupted: '已中断'};
export function CampaignPanel({collection, version, openExperiment}: {collection: string; version: number; openExperiment: (id: string) => void}) {
    const [offset, setOffset] = useState(0);
    const state = useQuantCampaigns(collection, offset, version);
    return <section className={`${cardClass} space-y-4`} aria-label="连续研究记录"><div className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold">AI 连续研究</h3><QuantButton disabled={state.loading} onClick={state.reload}>刷新连续研究</QuantButton></div>
        <p className="text-sm leading-7 text-slate-500">从资料分析或实验解读中的 AI 方案开启。系统按预算串起计算、解读和下一轮；结果保留每一轮父代、参数与失败记录。</p>
        {state.loading ? <p role="status" className="text-sm text-slate-500">正在加载连续研究…</p> : state.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : !state.items.length ? <p className="text-sm text-slate-400">暂无连续研究。已有 AI 方案时，可选择行情顺序与总预算后启动。</p> : state.items.map(row => <details key={row.id} className="rounded-xl border border-slate-200 p-4" open={['pending', 'running'].includes(row.status) || undefined}>
            <summary className="cursor-pointer text-sm font-semibold">{row.name} · {names[row.status]} · {row.rounds.length}/{row.plan.maxRounds} 轮</summary>
            <div className="mt-4 space-y-3 text-xs leading-6 text-slate-600"><p>已预留 {row.reservedAttempts}/{row.plan.maxAttempts} 次候选尝试、{row.reservedComputeSeconds}/{row.plan.computeSeconds} 秒计算；已创建 {row.modelCalls}/{row.plan.maxRounds} 次模型解读。总耗时上限 {row.plan.wallSeconds} 秒。</p>
                {row.message && <p role="status">{row.message}</p>}
                {row.rounds.map(step => <div key={step.ordinal} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3"><span>第 {step.ordinal} 轮 · {statusNames[step.experiment.status]} · 解读：{({pending: '排队中', running: '生成中', completed: '完成', cancelled: '取消', failed: '失败', interrupted: '中断'} as Record<string, string>)[step.reviewStatus || ''] || (['pending', 'running'].includes(step.experiment.status) ? '等待计算完成' : '未创建')}</span><QuantButton onClick={() => openExperiment(step.experiment.id)}>查看本轮实验</QuantButton></div>)}
                {['pending', 'running'].includes(row.status) && <QuantButton danger disabled={state.busy === row.id} onClick={() => void state.cancel(row.id)}>停止连续研究</QuantButton>}
                <p className="text-slate-400">自动研究仍是待验证过程；预选行情也可能重叠，不能把反复选择后的表现认定为独立验证。</p>
            </div></details>)}
        {state.actionError && <p role="alert" className="text-sm text-red-600">{state.actionError}</p>}
        {state.total > 10 && <div className="flex justify-end gap-2"><QuantButton disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 10))}>上一页研究</QuantButton><QuantButton disabled={offset + 10 >= state.total} onClick={() => setOffset(value => value + 10)}>下一页研究</QuantButton></div>}
    </section>;
}
