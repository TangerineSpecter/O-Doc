import type {QuantSourceImpact} from '../../../types/api/quantSourceImpact';
import {CodeEditor} from '../CodeEditor';

const lineLabel = (start: number | null, end: number | null) => start === null ? '此侧无原文行' : `第 ${start}${end !== start ? `–${end}` : ''} 行`;
const editorLanguage = (language: string) => language === 'python' || language === 'pine' || language === 'mql4' || language === 'tongdaxin' ? language : 'text';
const kinds = {insert: '新增原文', delete: '删除原文', replace: '替换原文'};

export function SourceImpactDiff({code, oldLanguage, newLanguage}: {code: QuantSourceImpact['code']; oldLanguage: string; newLanguage: string}) {
    return <details className="rounded-xl border border-slate-200 p-4" open>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">源码原文 · {code.total_hunks} 处变更</summary>
        <p className="mt-3 text-xs leading-6 text-slate-500">基准 {code.old_line_count} 行 → 目标 {code.new_line_count} 行；行号从 1 开始，范围包含首尾行。</p>
        {!code.hunks.length && <p className="mt-2 text-sm leading-7 text-slate-600">{code.status === 'identical' ? '两份来源的代码原文相同；其他来源字段和参数背景仍需分别核对。' : '本次未生成逐段差异，请查看下方受限原因。'}</p>}
        <div className="mt-4 space-y-4">{code.hunks.map((hunk, index) => <div key={index} className="space-y-3">
            <h4 className="text-xs font-medium text-slate-600">{index + 1}. {kinds[hunk.kind]}</h4>
            <div className="grid gap-3 xl:grid-cols-2">{(['old', 'new'] as const).map(side => <div key={side} className="min-w-0 space-y-2">
                <p className="text-xs text-slate-500">{side === 'old' ? '基准原文' : '目标原文'} · {lineLabel(hunk[`${side}_start`], hunk[`${side}_end`])}{hunk[`${side}_truncated`] ? ' · 展示已截断' : ''}</p>
                {hunk[`${side}_start`] === null ? <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-400">此侧没有对应原文</div> : <CodeEditor value={hunk[`${side}_text`]} language={editorLanguage(side === 'old' ? oldLanguage : newLanguage)} firstLine={hunk[`${side}_start`] || 1} readOnly compact/>}
            </div>)}</div>
        </div>)}</div>
        {code.omitted_hunks > 0 && <p className="mt-3 text-xs text-orange-700">另有 {code.omitted_hunks} 处变更未展开，当前明细不覆盖全部变化。</p>}
        {code.limitations.map((text, index) => <p key={index} className="mt-2 text-xs leading-6 text-slate-500">{text}</p>)}
    </details>;
}
