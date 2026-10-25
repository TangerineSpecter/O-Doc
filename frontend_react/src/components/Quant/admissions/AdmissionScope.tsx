import type {AdmissionScope as Scope} from '../../../types/api/quantAdmission';
import {admissionRange,admissionValues,researchStageLabels} from '../../../utils/quantAdmission';
const checks:Record<string,string>={calculation_completed:'计算完成',all_registered_rules_met:'全部登记标准满足',fresh_mode:'按新数据评价',imported_after_registration:'数据在登记后导入',authorization_audit_complete:'启动前核对完整',authorization_no_known_reuse:'启动时无已知复用',publication_audit_complete:'发布前核对完整',publication_no_known_reuse:'发布时无已知复用'};
const criteria:Record<string,string>={min_total_return:'最低总收益',max_drawdown:'最大回撤上限',min_excess_return:'最低超额收益',min_signal_coverage:'最低信号覆盖率',min_entries:'最低入场次数'};
export function AdmissionScope({value}:{value:Scope}) {
    const market=value.market;
    return <article className="space-y-2 break-words border-t border-slate-100 pt-3 text-xs leading-6 text-slate-600">
        <p className="font-medium text-slate-800">{researchStageLabels[value.stage]} · {value.observation_id}</p>
        {value.observed_stage&&value.observed_stage!==value.stage&&<p className="text-orange-700">已有{researchStageLabels[value.observed_stage]}，结构准入仍有阻断。</p>}
        {value.sample_status==='planned_not_completed'&&<p className="text-orange-700">评价未完成，以下是冻结计划范围。</p>}
        <p>{market?`${market.symbol||'标的未知'} · ${market.timeframe||'周期未知'} · ${market.price_adjustment||'价格口径未知'}`:'市场范围见原始证据'}<br/>{admissionRange(value.sample)}</p>
        {value.parameters!==undefined&&<p className="break-words">实际参数：{admissionValues(value.parameters)}</p>}
        {value.bindings!==undefined&&<p className="break-words">输入绑定：{admissionValues(value.bindings)}</p>}
        {value.config&&<p>费用：{value.config.fee_bps===undefined?'未知':`${value.config.fee_bps} bps`}；滑点：{value.config.slippage_bps===undefined?'未知':`${value.config.slippage_bps} bps`}；阈值：{value.config.threshold===undefined?'未知':String(value.config.threshold)}。</p>}
        {value.reason&&<p className="break-words">未完成原因：{value.reason}</p>}
        {value.criteria&&<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">{Object.entries(criteria).filter(([key])=>value.criteria?.[key]!==null&&value.criteria?.[key]!==undefined).map(([key,label])=><div className="contents" key={key}><dt>{label}{key==='min_entries'?'（次）':'（比率）'}</dt><dd className="text-right tabular-nums">{String(value.criteria![key])}</dd></div>)}</dl>}
        {value.checks&&<p>{Object.entries(value.checks).filter(([,met])=>!met).map(([key])=>`${checks[key]||key}未满足`).join('；')||'本记录的登记条件核对均满足'}</p>}
        <details><summary className="cursor-pointer">完整冻结配置与范围</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 scrollbar-hide">{JSON.stringify(value,null,2)}</pre></details>
    </article>;
}
