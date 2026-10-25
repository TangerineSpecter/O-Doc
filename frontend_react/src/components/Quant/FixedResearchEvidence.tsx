import {StrategySummary} from './experiments/StrategyResults';
import {readFixedHistory} from '../../utils/quantFixedHistory';
import {RegisteredCriteriaResult} from './validations/RegisteredCriteriaResult';
const pct=(v: number)=>`${(v*100).toFixed(2)}%`;
export function FixedResearchEvidence({evidence}: {evidence: Record<string,unknown>}) {
    let value: ReturnType<typeof readFixedHistory>;
    try {value=readFixedHistory(evidence);} catch {return <p role="alert" className="text-xs text-amber-700">历史固定验证的版本或证据结构无法读取，原报告仍保留。</p>;}
    return <section aria-label="历史固定验证事实" className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">
        <p>{value.status==='completed'?'已完成':value.status==='failed'?'失败':'已取消'} · {value.mode==='fresh'?'当时按新数据条件预约':'普通复核，允许已用数据'} · {value.symbol} {value.timeframe}</p>
        <p className="break-words">{value.start} → {value.end}</p>
        <p className="break-all font-mono">实际参数：{value.parameters.map(([k,v])=>`${k}=${v}`).join('，') || '无可调参数'}</p>
        <p>来源尝试：{value.attempt}</p>
        {value.strategy && <details><summary className="cursor-pointer text-orange-700">查看历史冻结策略规则</summary><div className="mt-3"><StrategySummary policy={value.strategy} threshold={value.threshold}/></div></details>}
        <p>单侧手续费 {value.feeBps} bps，滑点 {value.slippageBps} bps。</p>
        {value.final && value.baseline?<p>固定方案 {pct(value.final.totalReturn)}，基线 {pct(value.baseline.totalReturn)}，最大回撤 {pct(value.final.maxDrawdown)}。</p>:<p>未形成完整收益成果；失败或取消不能当作收益为零。</p>}
        {value.error && <p className="text-amber-700">{value.error}</p>}
        {value.criteria && <RegisteredCriteriaResult criteria={value.criteria} assessment={value.assessment}/>}
        <p>预约时 {value.authorization.conflicts} 条重叠{value.publication?`，发布时 ${value.publication.conflicts} 条重叠`:''}；外部使用未知。该区间已被查看，后续假设需要另外的新数据。</p>
    </section>;
}
