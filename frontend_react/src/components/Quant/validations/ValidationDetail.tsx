import {quantValidations} from '../../../api/quantValidations';
import type {QuantValidation} from '../../../types/api/quantValidation';
import {readValidation} from '../../../utils/quantValidation';
import {createRequestKey} from '../../../utils/requestKey';
import {ExperimentCurve} from '../experiments/ExperimentCurve';
import {StrategySummary,StrategyLedger} from '../experiments/StrategyResults';
import {statusNames,percent} from '../experiments/readout';
import {ReportMarkdown} from '../ReportMarkdown';
import {QuantButton} from '../ui';
import {BindValidation} from './BindValidation';
import {ValidationAudit} from './ValidationAudit';
import {RegisteredCriteriaResult} from './RegisteredCriteriaResult';
import {LabelEvaluation} from './LabelEvaluation';
export function ValidationDetail({collection,plan,busy,act,datasets,openReport}: {collection: string;plan: QuantValidation;busy: boolean;act: (action: ()=>Promise<QuantValidation>)=>Promise<void>;datasets: ()=>void;openReport: (entry: string,report: string)=>void}) {
    let value: ReturnType<typeof readValidation>;
    try {value=readValidation(plan);} catch {return <p role="alert" className="text-sm text-red-600">固定验证数据版本或内容无法读取，原记录保留，请刷新或升级客户端。</p>;}
    const evaluation=plan.evaluation,active=evaluation && ['pending','running'].includes(evaluation.status);
    const review=evaluation?.reviews?.find(r=>r.report),runningReview=evaluation?.reviews?.find(r=>['pending','running'].includes(r.run.status));
    const error=evaluation?.error || value.error;
    return <div className="min-w-0 space-y-5 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h5 className="break-words text-sm font-semibold">{plan.name}</h5><p className="mt-1 text-xs leading-6 text-slate-500">{evaluation?statusNames[evaluation.status]:'已登记，待导入行情'} · {new Date(plan.createdAt).toLocaleString()}</p></div>
            {active && <QuantButton disabled={busy || evaluation.cancelRequested} danger onClick={()=>void act(()=>quantValidations.cancel(collection,plan.id))}>{evaluation.cancelRequested?'正在停止…':'停止固定验证'}</QuantButton>}
        </div>
        {value.demo && <p role="status" className="text-xs leading-6 text-amber-700">本地人工演示样例；结果与报告用于界面验证，没有执行公式、回测或调用模型。</p>}
        <details open={!evaluation}><summary className="cursor-pointer text-xs font-medium text-orange-700">查看冻结公式、参数与策略规则</summary><div className="mt-4 space-y-4">
        <dl className="grid gap-3 text-xs leading-6 sm:grid-cols-2">{[
            ['来源尝试',value.attempt],['验证标的与周期',`${value.symbol} · ${value.timeframe}`],['固定截止点',value.after],['评价预算',`${value.intervals} 个收益区间 · ${value.seconds} 秒`],
            ['预热与信号',`首个新开盘前至少 ${value.history+1} 根`],['单侧成本',`手续费 ${value.feeBps} bps · 滑点 ${value.slippageBps} bps`],
        ].map(([label,text])=><div key={label}><dt className="text-slate-400">{label}</dt><dd className="break-words text-slate-700">{text}</dd></div>)}</dl>
        <div className="flex flex-wrap gap-2" aria-label="固定验证实际参数">{value.parameters.length?value.parameters.map(([key,v])=><span key={key} className="break-all rounded-lg bg-slate-50 px-3 py-1 font-mono text-xs text-slate-600">{key} = {v}</span>):<span className="text-xs text-slate-500">此公式没有可调参数</span>}</div>
        {value.strategy && <StrategySummary policy={value.strategy} threshold={value.threshold}/>}
            <pre className="max-h-60 overflow-auto rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600 scrollbar-hide">{value.expression}</pre>
        </div></details>
        <p className="text-xs leading-6 text-slate-500">公式和参数已冻结。{evaluation?.mode==='replication'?'本次为普通复核，允许已用数据。':'新数据资格仅指已记录的登记和区间条件。'}一次固定验证不证明参数最优或全局独立。</p>
        {error && <p role="alert" className="text-sm leading-7 text-amber-800">{error}</p>}
        {value.criteria && <RegisteredCriteriaResult criteria={value.criteria} assessment={value.assessment} currentAudit={value.currentAudit}/>}
        {value.labelTarget && <LabelEvaluation target={value.labelTarget} value={value.labelEvaluation}/>}
        {!evaluation && <BindValidation collection={collection} plan={plan} busy={busy} act={act} datasets={datasets}/>}
        {evaluation?.status==='completed' && <section className="space-y-3 border-t border-slate-100 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-semibold">AI 固定验证解读与研究评分</h5><QuantButton disabled={busy || !!runningReview} onClick={()=>void act(()=>quantValidations.review(collection,plan.id,createRequestKey()))}>{runningReview?'AI 正在解读…':review?'重新解读':'生成 / 重试解读'}</QuantButton></div>
            {!review && <p className="text-xs leading-6 text-slate-500">计算完成后自动尝试生成一份报告；未配置模型或调用失败时，可配置后重试。原始计算事实一直保留。</p>}
            {evaluation.reviews?.find(r=>r.run.error) && <p role="status" className="text-xs text-amber-700">{evaluation.reviews.find(r=>r.run.error)?.run.error}</p>}
            {review?.report && <><ReportMarkdown text={review.report.markdown}/><QuantButton onClick={()=>openReport(review.run.entryId,review.report!.id)}>打开解读报告与修订历史</QuantButton></>}
        </section>}
        {value.final && value.baseline && <><div className="grid gap-3 sm:grid-cols-3">{[['固定方案收益',percent(value.final.totalReturn)],['同成本基线收益',percent(value.baseline.totalReturn)],['固定方案最大回撤',percent(value.final.maxDrawdown)]].map(([label,v])=><div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-800">{v}</p></div>)}</div>
            <ExperimentCurve final={value.final} baseline={value.baseline} label="固定方案 · 新评价区间"/>
            <details><summary className="cursor-pointer text-xs text-orange-700">查看固定方案与基线的完整成交账本</summary><div className="mt-3 space-y-3"><StrategyLedger execution={value.final.execution} label="固定验证方案"/><StrategyLedger execution={value.baseline.execution} label="固定验证买入持有对照"/></div></details>
        </>}
        {value.currentAudit && <ValidationAudit value={value.currentAudit} label="当前已知数据使用"/>}
        {value.publicationAudit && <details><summary className="cursor-pointer text-xs text-orange-700">查看结果发布时的冻结审计</summary><div className="mt-3"><ValidationAudit value={value.publicationAudit} label="发布时审计"/></div></details>}

    </div>;
}
