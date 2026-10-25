import type {QuantExecutionProvenance} from '../../../../types/api/quantPlatformEvidence';

export function ExecutionProvenance({value, reference}: {value?: QuantExecutionProvenance; reference: string}) {
    return <details className="text-xs leading-6 text-slate-500"><summary className="cursor-pointer">原文定位与证据引用</summary><p className="mt-2 break-all font-mono">{reference}</p>{value && <><p className="mt-1 break-words">{value.format} · {value.path || '原始文档'}{value.line !== null ? ` · 行 ${value.line}` : ''}{value.table !== null ? ` · 表 ${value.table}` : ''}{value.row !== null ? ` · 行 ${value.row}` : ''}</p>{value.quote && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 scrollbar-hide">{value.quote}</pre>}<p className="mt-2 break-all text-[11px]">原文指纹：{value.content_hash}</p></>}</details>;
}
