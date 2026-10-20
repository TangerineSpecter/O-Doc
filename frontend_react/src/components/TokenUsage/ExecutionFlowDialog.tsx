import {useState} from 'react';
import {Loader2, Network, RefreshCw} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {useExecutionFlow} from '../../hooks/useExecutionFlow';
import {flowTotals} from '../../utils/executionFlow';
import {tokenNumber} from '../../utils/tokenUsage';
import ExecutionFlowStep, {ExecutionFlowOutput} from './ExecutionFlowStep';

function describe(taskName?: string, startedAt?: string): string {
    const parts = [taskName || '未命名任务'];
    if (startedAt) {
        const date = new Date(startedAt);
        if (!Number.isNaN(date.getTime())) {
            parts.push(
                date.toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                })
            );
        }
    }
    return parts.join(' · ');
}

const SEGMENT_ON = 'rounded-full bg-white px-2.5 py-1 text-slate-800 shadow-2xs';
const SEGMENT_OFF = 'rounded-full px-2.5 py-1 text-slate-500 hover:text-slate-700';

/** 执行流程视图：把一次执行的每次模型请求渲染成连续的步骤卡片流。 */
export default function ExecutionFlowDialog({
    recordId,
    taskName,
    startedAt,
    onClose,
}: {
    recordId: string | null;
    taskName?: string;
    startedAt?: string;
    onClose: () => void;
}) {
    const {state, reload} = useExecutionFlow(recordId);
    const [mode, setMode] = useState<'flow' | 'raw'>('flow');
    const totals = flowTotals(state.steps);

    const modeToggle = (
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-medium">
            <button type="button" onClick={() => setMode('flow')} aria-pressed={mode === 'flow'} className={mode === 'flow' ? SEGMENT_ON : SEGMENT_OFF}>
                流程视图
            </button>
            <button type="button" onClick={() => setMode('raw')} aria-pressed={mode === 'raw'} className={mode === 'raw' ? SEGMENT_ON : SEGMENT_OFF}>
                原始 JSON
            </button>
        </div>
    );

    return (
        <WorldDialog
            title="执行流程"
            description={describe(taskName, startedAt)}
            size="extra-wide"
            onClose={onClose}
            titleAction={modeToggle}
        >
            <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                        <Network className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
                        {totals.steps} 步
                    </span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums">
                        <span>合计 {tokenNumber(totals.tokens)} token</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span>输入 {totals.inputChars.toLocaleString('zh-CN')} 字</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span>输出 {totals.outputChars.toLocaleString('zh-CN')} 字</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className={totals.ready === totals.steps ? '' : 'text-amber-700'}>
                            正文可用 {totals.ready}/{totals.steps}
                        </span>
                    </div>
                </div>

                {state.loading && (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-[11px] text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-orange-500" aria-hidden="true" />
                        {state.steps.length
                            ? `正在读取正文 ${state.loaded}/${state.steps.length} 步…`
                            : '正在读取执行流程…'}
                    </div>
                )}

                {state.error && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200/80 bg-red-50/60 px-3 py-2 text-[11px] text-red-700">
                        <span>{state.error}</span>
                        <button type="button" onClick={reload} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-0.5 font-medium hover:bg-red-50">
                            <RefreshCw className="h-3 w-3" aria-hidden="true" />
                            重试
                        </button>
                    </div>
                )}

                {!state.loading && !state.error && !state.steps.length && (
                    <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center text-xs text-slate-400">
                        该执行没有可展示的模型请求记录。
                    </p>
                )}

                {state.steps.length > 0 && (
                    <div className="min-w-0">
                        {state.steps.map((step, index) => (
                            <div key={step.id} className="min-w-0">
                                <ExecutionFlowStep step={step} mode={mode} />
                                <ExecutionFlowOutput step={step} last={index === state.steps.length - 1} />
                            </div>
                        ))}
                        {!state.loading && (
                            <div className="flex justify-center pt-0.5">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-400">
                                    流程结束
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </WorldDialog>
    );
}
