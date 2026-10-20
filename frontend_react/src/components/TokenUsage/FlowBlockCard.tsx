import {useState} from 'react';
import {ChevronDown, ChevronRight} from 'lucide-react';
import type {FlowBlock} from '../../types/api/tokenUsage';
import {formatBytes} from '../../utils/executionFlow';

/** 流程视图里的一张小卡片：分段标签 + 字数/字节数，点击展开全文。 */
export default function FlowBlockCard({block}: {block: FlowBlock}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(value => !value)}
                className="flex w-full items-start gap-2 text-left"
            >
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{block.label}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-400">
                    {block.chars.toLocaleString('zh-CN')} 字 · {formatBytes(block.bytes)}
                </span>
                {open ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                )}
            </button>
            {open ? (
                <pre className="scrollbar-hide mt-2 max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200/70 bg-slate-50/80 p-2 font-mono text-[11px] leading-relaxed text-slate-700">
                    {block.text || '（空内容）'}
                </pre>
            ) : (
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-all text-[11px] leading-relaxed text-slate-500">
                    {block.preview || '（空内容）'}
                </p>
            )}
        </div>
    );
}
