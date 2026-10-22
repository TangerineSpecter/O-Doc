import {useEffect, useMemo, useState} from 'react';
import {AlertTriangle, Loader2} from 'lucide-react';
import {getTokenRequestContent} from '../../api/tokenUsage';
import type {TokenRequest, TokenRequestContent} from '../../types/api/tokenUsage';
import {inputBlocksFromRequest, outputFromResponse} from '../../utils/executionFlow';
import {changedBlocks, inputClues, sourceGroups, sourceNames, type SourceKind} from '../../utils/tokenObservatory';
import {requestStatus, tokenNumber} from '../../utils/tokenUsage';
import FlowBlockCard from './FlowBlockCard';

function useBodies(current: string, previous?: string, refresh = 0) {
    const key = JSON.stringify([current, previous, refresh]);
    const [state, setState] = useState<{key: string; bodies: Record<string, TokenRequestContent>}>({key: '', bodies: {}});
    useEffect(() => {
        const controller = new AbortController();
        const [id, before] = JSON.parse(key) as [string, string | undefined];
        const ids = [...new Set([id, before].filter((v): v is string => Boolean(v)))];
        void Promise.all(ids.map(async value => {
            try {return [value, await getTokenRequestContent(value, controller.signal)] as const;}
            catch {return [value, {available: false, message: '正文读取失败，可点击刷新重试'}] as const;}
        })).then(rows => {if (!controller.signal.aborted) setState({key, bodies: Object.fromEntries(rows)});});
        return () => controller.abort();
    }, [key]);
    return state.key === key ? {loading: false, bodies: state.bodies} : {loading: true, bodies: {} as Record<string, TokenRequestContent>};
}

const sourceColors: Record<SourceKind, string> = {instructions: 'bg-slate-400', tools: 'bg-violet-300', business: 'bg-lime-400', history: 'bg-amber-400', tool_results: 'bg-orange-400'};
const tabs = {sources: '输入来源', messages: '输入 / 输出', diff: '与前次对比', clues: '排查线索'};
type Tab = keyof typeof tabs;

export default function ObservationInspector({current, previous, refresh, initialTab = 'sources'}: {
    current: TokenRequest; previous?: TokenRequest; refresh: number; initialTab?: Tab;
}) {
    const [tab, setTab] = useState<Tab>(initialTab);
    const [source, setSource] = useState<SourceKind>('business');
    const {loading, bodies} = useBodies(current.id, previous?.id, refresh);
    const body = bodies[current.id];
    const before = previous ? bodies[previous.id] : undefined;
    const blocks = useMemo(() => body?.available ? inputBlocksFromRequest(body.request) : [], [body]);
    const oldBlocks = useMemo(() => before?.available ? inputBlocksFromRequest(before.request) : [], [before]);
    const groups = useMemo(() => sourceGroups(blocks), [blocks]);
    const clues = useMemo(() => inputClues(current, blocks, previous, before?.available ? oldBlocks : undefined), [current, blocks, previous, before, oldBlocks]);
    const output = useMemo(() => body?.available ? outputFromResponse(body.response) : null, [body]);
    const max = Math.max(1, ...groups.map(g => g.chars));
    const active = groups.find(g => g.kind === source)!;
    const differences = useMemo(() => changedBlocks(blocks, oldBlocks), [blocks, oldBlocks]);
    return <section className="border-t border-slate-100 p-4 sm:p-5" aria-label="模型请求分析">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">{current.phase || '模型请求'}</h3>
            <span className={`rounded-lg px-2 py-1 text-xs ${current.status === 'failed' ? 'bg-red-50 text-red-600' : current.status === 'running' ? 'bg-orange-50 text-orange-700' : 'bg-slate-50 text-slate-600'}`}>{requestStatus[current.status] || current.status}</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{current.modelName || '未知模型'} · {current.providerName || '未知服务'} · 第 {current.attempt} 次尝试{current.endedAt ? ` · ${(Math.max(0, Date.parse(current.endedAt) - Date.parse(current.startedAt)) / 1000).toFixed(1)} 秒` : ''}</p>
        <div className="my-3 flex flex-wrap gap-1" role="tablist" aria-label="请求分析方式">
            {(Object.keys(tabs) as Tab[]).map(key => <button type="button" role="tab" key={key} aria-selected={tab === key} onClick={() => setTab(key)} className={`whitespace-nowrap shrink-0 rounded-lg px-3 py-1.5 text-xs ${tab === key ? 'bg-slate-100 font-medium text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>{tabs[key]}{key === 'clues' && clues.length ? ` · ${clues.length}` : ''}</button>)}
        </div>
        <div className="mb-3 flex flex-wrap justify-between gap-2 text-[11px] text-slate-400"><span>接口实报：输入 {tokenNumber(current.inputTokens)} / 输出 {tokenNumber(current.outputTokens)} Token</span><span>缓存 {tokenNumber(current.cachedTokens)} · 思考 {tokenNumber(current.reasoningTokens)}（细分不累加）</span></div>
        {loading ? <p role="status" className="flex items-center gap-2 py-6 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-orange-500"/>正在读取选中请求及相邻请求的正文…</p> : !body?.available ? <p className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">{body?.message || '正文不可用'}。请求用量仍保留。</p> : <>
            {tab === 'sources' && <>
                <p className="mb-3 text-[11px] text-slate-400">展示文本的字符构成，非 Token 分摊；JSON 分段经过格式化，不含协议开销。</p>
                <div className="grid gap-5 xl:grid-cols-2">
                    <div>{groups.map(group => <button type="button" key={group.kind} aria-pressed={source === group.kind} onClick={() => setSource(group.kind)} className="mb-3 block w-full text-left">
                        <span className={`mb-1.5 flex justify-between gap-2 text-xs ${source === group.kind ? 'font-semibold text-slate-800' : 'text-slate-600'}`}><span>{group.name}</span><span className="font-mono tabular-nums">{group.chars.toLocaleString()} 字</span></span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${sourceColors[group.kind]}`} style={{width: `${group.chars / max * 100}%`}}/></span>
                    </button>)}</div>
                    <div className="min-w-0 space-y-2 rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-700">{sourceNames[source]} · {active.blocks.length} 段</p>
                        {!active.blocks.length && <p className="text-xs text-slate-400">本次未解析到此类输入。</p>}
                        {active.blocks.map(block => <div key={block.id}><p className="mb-1 break-all text-[10px] text-slate-400">{block.source}</p><FlowBlockCard block={block}/></div>)}
                    </div>
                </div>
            </>}
            {tab === 'messages' && <div className="grid gap-4 xl:grid-cols-2">{[{label: '完整输入分段', rows: blocks}, {label: '模型输出与工具调用', rows: output?.blocks || []}].map(side => <div key={side.label} className="min-w-0 space-y-2"><h4 className="text-xs font-semibold text-slate-700">{side.label}</h4>{side.rows.map(block => <div key={block.id}><p className="mb-1 break-all text-[10px] text-slate-400">{block.source}</p><FlowBlockCard block={block}/></div>)}</div>)}</div>}
            {tab === 'diff' && (!previous ? <p className="text-xs text-slate-500">这是同一执行内的首次已采集请求，没有前次可比。</p> : !before?.available ? <p className="text-xs text-amber-700">前次正文不可用，不能判断新增、沿用与移除。</p> : <div className="space-y-2">
                <p className="text-[11px] text-slate-400">只比较同一执行、同一居民的相邻请求；字数差不是 Token 差。</p>
                {differences.map((row, i) => <div key={`${row.state}-${row.block.id}-${i}`} className="rounded-xl border border-slate-200 p-3"><div className="mb-1 flex justify-between gap-2 text-xs"><span className={row.state === '新增' || row.state === '变化' ? 'text-orange-600' : 'text-slate-500'}>{row.state} · {row.block.label}</span><span className="font-mono text-slate-500">{row.before?.chars ?? 0} → {row.state === '移除' ? 0 : row.block.chars} 字</span></div><p className="mb-2 break-all text-[10px] text-slate-400">{row.block.source}</p><FlowBlockCard block={row.block}/>{row.state === '变化' && row.before && <details className="mt-2 text-[11px] text-slate-500"><summary>查看前次内容</summary><pre className="scrollbar-hide max-h-60 overflow-auto whitespace-pre-wrap break-all pt-2">{row.before.text}</pre></details>}</div>)}
            </div>)}
            {tab === 'clues' && <div className="space-y-2"><p className="text-[11px] text-slate-400">规则线索用于排查，不自动认定内容无关，也不修改真实输入。</p>{!clues.length && <p className="py-4 text-xs text-slate-500">未命中当前检查规则；不代表流程已经最优。</p>}{clues.map((clue, i) => <div key={i} className="rounded-xl border border-amber-100 bg-amber-50/40 p-3"><p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800"><AlertTriangle className="h-3.5 w-3.5 text-amber-500"/>{clue.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{clue.detail}</p>{clue.block && <div className="mt-2"><FlowBlockCard block={clue.block}/></div>}</div>)}</div>}
            <details className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500"><summary>原始请求参数与响应（本机保留 30 天）</summary><div className="mt-2 grid gap-3 xl:grid-cols-2">{[body.request, body.response].map((value, i) => <pre key={i} className="scrollbar-hide max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 font-mono text-[11px]">{JSON.stringify(value, null, 2) ?? '未记录'}</pre>)}</div></details>
        </>}
    </section>;
}
