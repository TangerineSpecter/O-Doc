import {useState} from 'react';
import {ArrowUpRight, ChevronDown, ChevronRight} from 'lucide-react';
import type {FlowBlock, FlowStep} from '../../types/api/tokenUsage';
import {tokenNumber} from '../../utils/tokenUsage';
import FlowBlockCard from './FlowBlockCard';

const DECISION_CLASSES = {
    card: 'border-violet-200/80',
    chip: 'bg-violet-50 text-violet-700',
    index: 'border-violet-200/90 bg-violet-50 text-violet-600',
};
const LARGE_CLASSES = {
    card: 'border-orange-200/80',
    chip: 'bg-orange-50 text-orange-700',
    index: 'border-orange-200/90 bg-orange-50 text-orange-600',
};

function stepTime(value: string): string {
    try {
        return new Date(value).toLocaleTimeString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    } catch {
        return '';
    }
}

function blockChars(blocks: FlowBlock[]): number {
    return blocks.reduce((sum, block) => sum + block.chars, 0);
}

export function FlowArrowHead({className = 'text-slate-300'}: {className?: string}) {
    return (
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true" className={className}>
            <path d="M0 0 L5 6 L10 0 Z" fill="currentColor" />
        </svg>
    );
}

/** 原始 JSON 折叠块：仅在切换到「原始 JSON」时渲染，避免直接铺开长正文。 */
function RawPayload({label, value}: {label: string; value: unknown}) {
    const [open, setOpen] = useState(false);
    const text = value === undefined ? '未记录' : JSON.stringify(value, null, 2);

    return (
        <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(current => !current)}
                className="flex w-full items-center gap-2 text-left text-[11px] font-semibold text-slate-700"
            >
                {open ? <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden="true" /> : <ChevronRight className="h-3 w-3 text-slate-400" aria-hidden="true" />}
                <span>{label}</span>
                <span className="ml-auto font-mono text-[10px] font-normal tabular-nums text-slate-400">
                    {text.length.toLocaleString('zh-CN')} 字符
                </span>
            </button>
            {open && (
                <pre className="scrollbar-hide mt-2 max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200/70 bg-slate-50/80 p-2 font-mono text-[11px] leading-relaxed text-slate-700">
                    {text}
                </pre>
            )}
        </div>
    );
}

/** 单步大卡片：这一步在干什么，以及被虚线框包住的输入分段小卡片。 */
export default function ExecutionFlowStep({step, mode}: {step: FlowStep; mode: 'flow' | 'raw'}) {
    const tone = step.modelType === 'decision_model' ? DECISION_CLASSES : LARGE_CLASSES;
    const modelLabel = step.modelType === 'decision_model' ? '决策' : '大模型';
    const inputChars = blockChars(step.inputs);

    return (
        <article className={`rounded-2xl border ${tone.card} bg-white p-3.5 shadow-xs`}>
            <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                    <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-bold ${tone.index}`}
                    >
                        {step.index}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-800">{step.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                            <span>{step.purposeLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span>{step.agentName || '系统规划'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{stepTime(step.startedAt)}</span>
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.chip}`}>
                        {modelLabel}
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="font-mono">{step.modelName || '未知模型'}</span>
                    </span>
                    <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                        合计 {tokenNumber(step.totalTokens)} token
                    </span>
                </div>
            </header>

            {mode === 'raw' ? (
                <div className="mt-3 space-y-2">
                    <RawPayload label="模型输入参数" value={step.rawRequest} />
                    <RawPayload label="模型响应" value={step.rawResponse} />
                </div>
            ) : step.unavailable ? (
                <p className="mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 p-3 text-[11px] text-amber-700">
                    {step.unavailable}
                </p>
            ) : (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-2.5">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
                        <span className="font-semibold text-slate-600">输入 · {step.inputs.length} 段</span>
                        <span className="font-mono tabular-nums text-slate-400">合计 {inputChars.toLocaleString('zh-CN')} 字</span>
                    </div>
                    {step.inputs.length ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                            {step.inputs.map(block => (
                                <FlowBlockCard key={block.id} block={block} />
                            ))}
                        </div>
                    ) : (
                        <p className="py-1.5 text-center text-[11px] text-slate-400">本次请求没有可拆分的输入内容</p>
                    )}
                </div>
            )}
        </article>
    );
}

/** 输出节点：挂在步骤之间的箭头连线上，点击展开完整输出分段。 */
export function ExecutionFlowOutput({step, last}: {step: FlowStep; last: boolean}) {
    const [open, setOpen] = useState(false);
    const chars = blockChars(step.output);
    const empty = !step.output.length;

    return (
        <div className="flex flex-col items-center">
            <span className="h-3 w-px bg-slate-300" aria-hidden="true" />
            <section className="w-full rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
                <button
                    type="button"
                    aria-expanded={open}
                    disabled={empty}
                    onClick={() => setOpen(value => !value)}
                    className="flex w-full items-center gap-2 text-left disabled:cursor-default"
                >
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                    <span className="shrink-0 text-[11px] font-semibold text-slate-700">输出</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                        {step.outputSummary || '（无输出内容）'}
                    </span>
                    {chars > 0 && (
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-400">
                            {chars.toLocaleString('zh-CN')} 字
                        </span>
                    )}
                    {!empty &&
                        (open ? (
                            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                        ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                        ))}
                </button>
                {open && !empty && (
                    <div className="mt-2 grid gap-2 border-t border-dashed border-slate-200 pt-2 sm:grid-cols-2">
                        {step.output.map(block => (
                            <FlowBlockCard key={block.id} block={block} />
                        ))}
                    </div>
                )}
            </section>
            <span className="h-3 w-px bg-slate-300" aria-hidden="true" />
            {!last && <FlowArrowHead />}
        </div>
    );
}
