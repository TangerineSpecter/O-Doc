import type {TokenRequest} from '../../types/api/tokenUsage';
import {knownTokens} from '../../utils/tokenObservatory';
import {tokenNumber} from '../../utils/tokenUsage';

export default function ObservationOverview({requests, selected, onSelect, unavailable}: {
    requests: TokenRequest[]; selected?: string; onSelect: (request: TokenRequest) => void; unavailable: boolean;
}) {
    const tail = requests.slice(-24);
    const maximum = Math.max(1, ...tail.flatMap(r => [r.inputTokens || 0, r.outputTokens || 0]));
    const count = requests.length;
    const total = (field: 'inputTokens' | 'outputTokens' | 'totalTokens') => unavailable ? null : count ? knownTokens(requests, field) : 0;
    return <section aria-label="观测范围用量概览" className="grid shrink-0 grid-cols-2 gap-y-4 rounded-2xl border border-slate-200 bg-white py-4 shadow-sm xl:grid-cols-4">
        <div className="border-r border-slate-100 px-4"><p className="text-[11px] text-slate-500">已知总消耗</p><p className="mt-1 font-mono text-xl tabular-nums text-slate-800">{tokenNumber(total('totalTokens'))}<span className="ml-1 text-[11px] text-slate-400">token</span></p><p className="mt-1 text-[10px] text-slate-400">输入 {tokenNumber(total('inputTokens'))} · 输出 {tokenNumber(total('outputTokens'))}</p></div>
        <div className="px-4 xl:border-r xl:border-slate-100"><p className="text-[11px] text-slate-500">真实模型请求</p><p className="mt-1 font-mono text-xl text-slate-800">{unavailable ? '未知' : count}<span className="ml-1 text-[11px] text-slate-400">次</span></p><p className="mt-1 text-[10px] text-slate-400">{requests.filter(r => r.status === 'failed' || r.status === 'interrupted').length} 次失败/中断 · {requests.filter(r => r.attempt > 1).length} 次重试</p></div>
        <div className="border-r border-slate-100 px-4"><p className="text-[11px] text-slate-500">用量完整请求</p><p className="mt-1 font-mono text-xl text-slate-800">{unavailable ? '未知' : `${requests.filter(r => r.usageComplete && r.status !== 'running').length} / ${count}`}</p><p className="mt-1 text-[10px] text-slate-400">正文按需读取 · 未知用量不补零</p></div>
        <div className="min-w-0 px-4"><p className="text-[11px] text-slate-500">逐请求 · 橙为输入，灰为输出{count > 24 ? '（末 24 次）' : ''}</p><div className="mt-2 flex h-10 items-end gap-1 overflow-hidden">{tail.map(row => <button type="button" key={row.id} aria-label={`${row.phase || '模型请求'}，输入 ${tokenNumber(row.inputTokens)}，输出 ${tokenNumber(row.outputTokens)}`} aria-pressed={selected === row.id} title={`${row.modelName} · 输入 ${tokenNumber(row.inputTokens)} / 输出 ${tokenNumber(row.outputTokens)}`} onClick={() => onSelect(row)} className={`flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 rounded px-0.5 ${selected === row.id ? 'bg-orange-50 ring-1 ring-inset ring-orange-200' : 'hover:bg-slate-50'}`}><span className={`w-2 rounded-t ${row.inputTokens === null ? 'bg-slate-200' : 'bg-orange-400'}`} style={{height: `${Math.max(2, (row.inputTokens || 0) / maximum * 36)}px`}}/><span className="w-1 rounded-t bg-slate-400" style={{height: `${Math.max(2, (row.outputTokens || 0) / maximum * 36)}px`}}/></button>)}</div></div>
    </section>;
}
