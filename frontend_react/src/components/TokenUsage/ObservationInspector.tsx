import {requestPhaseName} from '../../utils/tokenUsageLabels';
import {useEffect, useMemo, useState} from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    Code2,
    Database,
    FileText,
    GitCompare,
    Layers,
    Loader2,
    Sparkles,
    XCircle,
} from 'lucide-react';
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

const sourceColors: Record<SourceKind, {bar: string; dot: string}> = {
    instructions: {bar: 'bg-slate-400', dot: 'bg-slate-400'},
    tools: {bar: 'bg-violet-400', dot: 'bg-violet-400'},
    business: {bar: 'bg-emerald-400', dot: 'bg-emerald-400'},
    history: {bar: 'bg-amber-400', dot: 'bg-amber-400'},
    tool_results: {bar: 'bg-orange-400', dot: 'bg-orange-400'},
};

const tabs = [
    {key: 'sources', label: '输入构成', icon: Layers},
    {key: 'messages', label: '输入 / 输出', icon: FileText},
    {key: 'diff', label: '与前次对比', icon: GitCompare},
    {key: 'clues', label: '排查线索', icon: AlertTriangle},
] as const;
type Tab = typeof tabs[number]['key'];

export default function ObservationInspector({current, previous, refresh, initialTab = 'sources'}: {
    current: TokenRequest; previous?: TokenRequest; refresh: number; initialTab?: Tab;
}) {
    const [tab, setTab] = useState<Tab>(initialTab);
    const [source, setSource] = useState<SourceKind>('business');
    const [rawOpen, setRawOpen] = useState(false);
    const {loading, bodies} = useBodies(current.id, previous?.id, refresh);
    const body = bodies[current.id];
    const before = previous ? bodies[previous.id] : undefined;
    const blocks = useMemo(() => body?.available ? inputBlocksFromRequest(body.request) : [], [body]);
    const oldBlocks = useMemo(() => before?.available ? inputBlocksFromRequest(before.request) : [], [before]);
    const groups = useMemo(() => sourceGroups(blocks), [blocks]);
    const clues = useMemo(() => inputClues(current, blocks, previous, before?.available ? oldBlocks : undefined), [current, blocks, previous, before, oldBlocks]);
    const output = useMemo(() => body?.available ? outputFromResponse(body.response) : null, [body]);
    const max = Math.max(1, ...groups.map(g => g.chars));
    const active = groups.find(g => g.kind === source) || groups[0];
    const differences = useMemo(() => changedBlocks(blocks, oldBlocks), [blocks, oldBlocks]);

    const isDecision = current.modelType === 'decision_model';
    const isFailed = current.status === 'failed' || current.status === 'interrupted';
    const isRunning = current.status === 'running';

    const elapsedSeconds = current.endedAt && current.startedAt
        ? ((Math.max(0, Date.parse(current.endedAt) - Date.parse(current.startedAt))) / 1000).toFixed(1)
        : null;

    return (
        <section className="flex flex-col gap-4 p-4 sm:p-5" aria-label="模型请求分析">
            {/* 请求概览元数据头 */}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            isDecision ? 'bg-violet-100 text-violet-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                            {isDecision ? '结构化决策' : '大语言模型'}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">
                            {requestPhaseName(current)}
                        </h4>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="font-mono text-xs text-slate-600">
                            {current.modelName || '未知模型'}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {current.attempt > 1 && (
                            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                第 {current.attempt} 次尝试（重试）
                            </span>
                        )}
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                            isFailed
                                ? 'bg-red-100 text-red-700'
                                : isRunning
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-emerald-100 text-emerald-700'
                        }`}>
                            {isFailed ? <XCircle className="h-3 w-3" /> : isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            {requestStatus[current.status] || current.status}
                        </span>
                    </div>
                </div>

                {/* 属性与用量清单小条 */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200/60 pt-2.5 text-xs text-slate-500">
                    <div className="flex flex-wrap items-center gap-3">
                        {current.providerName && (
                            <span className="flex items-center gap-1">
                                <Database className="h-3.5 w-3.5 text-slate-400" />
                                {current.providerName}
                            </span>
                        )}
                        {elapsedSeconds && (
                            <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                耗时 {elapsedSeconds} 秒
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                        <span className="rounded bg-white px-2 py-0.5 shadow-2xs border border-slate-200/70 text-slate-700">
                            实报输入 <span className="font-bold text-orange-600">{tokenNumber(current.inputTokens)}</span> / 输出 <span className="font-bold text-slate-800">{tokenNumber(current.outputTokens)}</span>
                        </span>
                        {(current.cachedTokens !== null || current.reasoningTokens !== null) && (
                            <span className="text-[10px] text-slate-400">
                                {current.cachedTokens !== null && `缓存 ${tokenNumber(current.cachedTokens)} `}
                                {current.reasoningTokens !== null && `思考 ${tokenNumber(current.reasoningTokens)}`}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* 胶囊分段控制器 Tab */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                    className="inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1 scrollbar-hide"
                    role="tablist"
                    aria-label="请求分析方式"
                >
                    {tabs.map(({key, label, icon: Icon}) => {
                        const isTabActive = tab === key;
                        const isCluesTab = key === 'clues';
                        return (
                            <button
                                type="button"
                                role="tab"
                                key={key}
                                aria-selected={isTabActive}
                                onClick={() => setTab(key)}
                                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                                    isTabActive
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <Icon className={`h-3.5 w-3.5 ${isTabActive ? 'text-orange-500' : 'text-slate-400'}`} />
                                {label}
                                {isCluesTab && clues.length > 0 && (
                                    <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                                        {clues.length}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="text-[11px] text-slate-400">
                    {tab === 'sources' && '按字符构成拆解 · 非计费 Token 分摊'}
                    {tab === 'messages' && '保留完整消息位置与工具定义'}
                    {tab === 'diff' && '同一执行相邻请求正文差异'}
                    {tab === 'clues' && '确定性规则排查建议'}
                </div>
            </div>

            {/* 内容加载状态 */}
            {loading ? (
                <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/50 py-10 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                    正在读取请求正文与上下文对比…
                </div>
            ) : !body?.available ? (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 text-xs text-amber-800">
                    <p className="font-semibold">{body?.message || '正文未记录或不可用'}</p>
                    <p className="mt-1 text-amber-700/80">请求已确认的用量数据不受影响。正文单独保存在发起请求的服务器，统计同步不会携带正文；当天缺失需核对采集、存储与部署挂载。</p>
                </div>
            ) : (
                <div className="min-h-0 flex-1">
                    {/* Tab 1: 输入构成 */}
                    {tab === 'sources' && (
                        <div className="grid gap-4 lg:grid-cols-12">
                            {/* 左侧五大分类比例条 */}
                            <div className="space-y-2 lg:col-span-5">
                                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                                    <p className="mb-2.5 text-xs font-semibold text-slate-700">各部分文本字符构成</p>
                                    <div className="space-y-2">
                                        {groups.map(group => {
                                            const isSelected = source === group.kind;
                                            const color = sourceColors[group.kind] || {bar: 'bg-slate-400', dot: 'bg-slate-400'};
                                            return (
                                                <button
                                                    type="button"
                                                    key={group.kind}
                                                    aria-pressed={isSelected}
                                                    onClick={() => setSource(group.kind)}
                                                    className={`group block w-full rounded-lg p-2 text-left transition-all ${
                                                        isSelected
                                                            ? 'bg-slate-50 ring-1 ring-slate-200'
                                                            : 'hover:bg-slate-50/60'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="flex items-center gap-1.5 font-medium text-slate-700">
                                                            <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                                                            {group.name}
                                                        </span>
                                                        <span className="font-mono text-[11px] tabular-nums text-slate-500">
                                                            {group.chars.toLocaleString()} 字 ({group.blocks.length} 段)
                                                        </span>
                                                    </div>
                                                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-300 ${color.bar}`}
                                                            style={{width: `${Math.max(group.chars > 0 ? 2 : 0, (group.chars / max) * 100)}%`}}
                                                        />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* 右侧选中分类的分段详情 */}
                            <div className="space-y-2.5 lg:col-span-7">
                                <div className="flex items-center justify-between px-1">
                                    <h5 className="text-xs font-bold text-slate-800">
                                        {sourceNames[source]} · {active.blocks.length} 个分段
                                    </h5>
                                    <span className="font-mono text-[11px] text-slate-400">
                                        合计 {active.chars.toLocaleString()} 字
                                    </span>
                                </div>
                                {active.blocks.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                                        本次请求中未解析到此类输入内容。
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {active.blocks.map(block => (
                                            <div key={block.id} className="space-y-1">
                                                <p className="break-all font-mono text-[10px] text-slate-400">
                                                    {block.source}
                                                </p>
                                                <FlowBlockCard block={block} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tab 2: 输入 / 输出 */}
                    {tab === 'messages' && (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="min-w-0 space-y-2.5">
                                <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                    <FileText className="h-4 w-4 text-slate-500" />
                                    <h5 className="text-xs font-bold text-slate-800">
                                        完整输入分段 ({blocks.length} 段)
                                    </h5>
                                </div>
                                <div className="space-y-2">
                                    {blocks.map(block => (
                                        <div key={block.id} className="space-y-1">
                                            <p className="break-all font-mono text-[10px] text-slate-400">
                                                {block.source}
                                            </p>
                                            <FlowBlockCard block={block} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="min-w-0 space-y-2.5">
                                <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                    <Sparkles className="h-4 w-4 text-orange-500" />
                                    <h5 className="text-xs font-bold text-slate-800">
                                        模型输出与工具调用 ({output?.blocks.length || 0} 段)
                                    </h5>
                                </div>
                                {output?.blocks && output.blocks.length > 0 ? (
                                    <div className="space-y-2">
                                        {output.blocks.map(block => (
                                            <div key={block.id} className="space-y-1">
                                                <p className="break-all font-mono text-[10px] text-slate-400">
                                                    {block.source}
                                                </p>
                                                <FlowBlockCard block={block} />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                                        暂无模型响应输出记录。
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tab 3: 与前次对比 */}
                    {tab === 'diff' && (
                        <div className="space-y-3">
                            {!previous ? (
                                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
                                    这是同一执行内的首次已采集请求，没有前次请求可作为对比基准。
                                </div>
                            ) : !before?.available ? (
                                <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 text-xs text-amber-800">
                                    前次请求正文不可用，系统不伪造新增、沿用与移除差异。
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    <p className="text-[11px] text-slate-400">
                                        对比同一执行内相邻请求；字数变化反映文本演进，非实际计费 Token 差异。
                                    </p>
                                    <div className="space-y-2">
                                        {differences.map((row, i) => {
                                            const isAdd = row.state === '新增';
                                            const isChange = row.state === '变化';
                                            const isRemove = row.state === '移除';
                                            return (
                                                <div
                                                    key={`${row.state}-${row.block.id}-${i}`}
                                                    className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs"
                                                >
                                                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                                                        <span className="flex items-center gap-1.5 font-medium">
                                                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                                                isAdd
                                                                    ? 'bg-emerald-100 text-emerald-700'
                                                                    : isChange
                                                                    ? 'bg-orange-100 text-orange-700'
                                                                    : isRemove
                                                                    ? 'bg-red-100 text-red-700'
                                                                    : 'bg-slate-100 text-slate-600'
                                                            }`}>
                                                                {row.state}
                                                            </span>
                                                            <span className="text-slate-800">{row.block.label}</span>
                                                        </span>
                                                        <span className="font-mono text-[11px] text-slate-400">
                                                            {row.before?.chars ?? 0} → {isRemove ? 0 : row.block.chars} 字
                                                        </span>
                                                    </div>
                                                    <p className="mb-2 break-all font-mono text-[10px] text-slate-400">
                                                        {row.block.source}
                                                    </p>
                                                    <FlowBlockCard block={row.block} />
                                                    {isChange && row.before && (
                                                        <details className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                                                            <summary className="cursor-pointer font-medium text-slate-500 hover:text-slate-800">
                                                                查看前次对应内容
                                                            </summary>
                                                            <pre className="scrollbar-hide mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-slate-600">
                                                                {row.before.text}
                                                            </pre>
                                                        </details>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 4: 排查线索 */}
                    {tab === 'clues' && (
                        <div className="space-y-3">
                            <p className="text-[11px] text-slate-400">
                                基于相同分段、长工具返回、显式重试等确定性规则生成。重复不等于浪费，长内容不等于无关。
                            </p>
                            {clues.length === 0 ? (
                                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
                                    未命中当前排查规则；本次请求结构紧凑，未发现明显异常。
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {clues.map((clue, i) => (
                                        <div
                                            key={i}
                                            className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5 shadow-2xs"
                                        >
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                                                {clue.title}
                                            </div>
                                            <p className="mt-1 text-xs leading-relaxed text-amber-800/90">
                                                {clue.detail}
                                            </p>
                                            {clue.block && (
                                                <div className="mt-2.5">
                                                    <FlowBlockCard block={clue.block} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 底部折叠：原始请求与响应 JSON */}
                    <div className="mt-4 border-t border-slate-100 pt-3">
                        <button
                            type="button"
                            onClick={() => setRawOpen(v => !v)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
                        >
                            <Code2 className="h-3.5 w-3.5 text-slate-400" />
                            {rawOpen ? '收起原始请求参数与响应' : '查看原始请求参数与响应（本机保留 30 天）'}
                        </button>
                        {rawOpen && (
                            <div className="mt-2.5 grid gap-3 lg:grid-cols-2">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-medium text-slate-400">Raw Request</span>
                                    <pre className="scrollbar-hide max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[10px] leading-relaxed text-slate-700">
                                        {JSON.stringify(body.request, null, 2) ?? '未记录'}
                                    </pre>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-medium text-slate-400">Raw Response</span>
                                    <pre className="scrollbar-hide max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[10px] leading-relaxed text-slate-700">
                                        {JSON.stringify(body.response, null, 2) ?? '未记录'}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
