import {readExecutionPreview, executionAdapters, executionStatuses} from '../../../../utils/quantPlatformEvidence';
import {ExecutionParameters} from './ExecutionParameters';
import {ExecutionAccounting} from './ExecutionAccounting';
import {ExecutionLedger} from './ExecutionLedger';
import {EvidenceRows} from './EvidenceRows';

export function ExecutionEvidence({json}: {json?: string}) {
    if (!json) return null;
    let value; try {value = readExecutionPreview(json);} catch (cause) {return <p role="alert" className="rounded-xl bg-orange-50 p-4 text-sm text-orange-800">{cause instanceof Error ? cause.message : '执行证据无法读取'}</p>;}
    const {execution_evidence: evidence, execution_accounting: accounting} = value;
    return <section className="space-y-4" aria-label="平台执行证据与核算">
        <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-900">{executionStatuses[accounting.status]}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{executionAdapters[evidence.adapter]} · {evidence.parser_status === 'parsed' ? '已解析' : evidence.parser_status === 'partial' ? '部分解析' : '格式不受支持'}。外部报告尚未独立验证；这里只核对所提供记录和声明口径下的金额，不证明原平台执行等价。</p></div>
        {value.local_demo && <p role="status" className="rounded-xl bg-orange-50 p-4 text-sm leading-7 text-orange-800">本地人工样例：未运行真实平台解析或成交核算。下面的状态、金额与差异仅用于验证界面和研究流程。</p>}
        {!value.local_demo && evidence.records.some(row => row.id.includes('LOCAL_EXECUTION_')) && <p role="status" className="rounded-xl bg-orange-50 p-4 text-sm leading-7 text-orange-800">当前记录明确标记为人工示例数据，只用于检查流程，不是平台真实运行记录。</p>}
        {evidence.warnings.length > 0 && <details className="rounded-xl bg-slate-50 p-4" open><summary className="cursor-pointer text-xs font-semibold text-slate-700">解析提示 · {evidence.warnings.length} 项</summary><EvidenceRows items={evidence.warnings} render={warning => <p className="break-words text-xs leading-6 text-slate-500">{warning.message}<span className="block break-all text-[11px]">{warning.code} · {warning.ref}</span></p>}/></details>}
        <ExecutionParameters parameters={evidence.parameters}/>
        <ExecutionAccounting evidence={evidence} accounting={accounting}/>
        <ExecutionLedger evidence={evidence}/>
        {evidence.limitations.map((text, index) => <p key={index} className="text-xs leading-6 text-slate-500">{text}</p>)}
        <details className="text-xs text-slate-500"><summary className="cursor-pointer">固定原文、解析与核算指纹</summary><p className="mt-2 break-all leading-6">原文：{evidence.document_hash}<br/>证据：{evidence.content_hash}<br/>核算：{accounting.content_hash}</p></details>
    </section>;
}
