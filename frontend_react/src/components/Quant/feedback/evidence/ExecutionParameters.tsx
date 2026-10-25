import type {QuantExecutionParameterComparison, QuantExecutionProvenance} from '../../../../types/api/quantPlatformEvidence';
import {ExecutionProvenance} from './ExecutionProvenance';
import {EvidenceRows} from './EvidenceRows';

const statuses = {same: '与默认值相同', different: '与默认值不同', type_mismatch: '类型或范围不符', default_unknown: '默认值未知', unknown_type: '声明类型待核对', unmatched: '未匹配源码声明', ambiguous: '声明存在歧义'};
export function ExecutionParameters({parameters, comparison}: {parameters: {name: string; value: string; unit: string; ref: string; provenance?: QuantExecutionProvenance}[]; comparison?: QuantExecutionParameterComparison}) {
    return <details className="rounded-xl border border-slate-200 p-4" open={parameters.length > 0}>
        <summary className="cursor-pointer text-sm font-semibold">报告声明的运行参数 · {parameters.length} 项</summary><p className="mt-3 text-xs leading-6 text-slate-500">保留报告中的原名和原值。这是平台报告的声明，尚无独立运行证明；源码默认值与配置文件值均不用于补齐实际输入。</p>
        <EvidenceRows items={parameters} empty="报告没有提供结构化运行参数，不能使用源码默认值代替。" render={row => {
            const matched = comparison?.rows.find(item => item.name === row.name);
            return <div className="space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="break-all font-mono font-medium">{row.name}</strong><span className="text-xs text-slate-500">{matched ? statuses[matched.status] : '未与源码声明核对'}</span></div><p className="break-all font-mono">报告值：{row.value}{row.unit ? ` ${row.unit}` : ''}</p>{matched && <p className="break-all text-xs text-slate-500">源码默认：{matched.declaration?.default_raw || '未知'}{matched.declaration ? ` · ${matched.declaration.type} · 第 ${matched.declaration.line} 行` : ''}</p>}<ExecutionProvenance value={row.provenance} reference={row.ref}/></div>;
        }}/>
        {!!comparison?.missing.length && <p className="mt-3 break-words text-xs leading-6 text-orange-700">报告未提供：{comparison.missing.map(row => row.name).join('、')}。未自动填入默认值。</p>}
        {comparison?.limitations.map((text, index) => <p key={index} className="mt-2 text-xs leading-6 text-slate-500">{text}</p>)}
    </details>;
}
