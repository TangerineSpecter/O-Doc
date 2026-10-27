import type {QuantAnalysis} from '../../../types/api/quant';
import {parameterLabel} from '../../../utils/quantParameterSource';
import {ParameterSource} from '../ParameterSource';

const categories:Record<string,string>={signal:'信号计算',risk:'仓位与风险',execution:'执行',display:'显示',constant:'写死常量',state:'计算状态'};
export function ReportParameters({parameters}:{parameters:QuantAnalysis['parameters']|undefined}) {
    if(!parameters?.length)return <p className="text-sm leading-7 text-slate-500">这份报告没有结构化参数记录。历史报告的参数说明仍保留在正文中；缺失不能解释为没有输入参数。</p>;
    return <section className="space-y-4" aria-label="AI 参数分析">
        <p className="text-xs leading-6 text-slate-500">下列为 AI 原稿的参数分析，默认值不代表实际运行配置。建议是待验证方案，人工编辑正文不会改写这些原稿记录；经实验支持的配置与范围见对应实验。</p>
        {parameters.map((parameter,index)=><article key={`${parameter.name}-${index}`} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-semibold text-slate-800">{parameterLabel(parameter)}</h3><span className="text-xs text-slate-500">{categories[parameter.category]||parameter.category} · {parameter.type}</span></div>
            <p className="break-words text-sm leading-7 text-slate-700">源码默认值：<span className="font-mono">{parameter.defaultValue===''?'未知':parameter.defaultValue}</span></p>
            <dl className="grid gap-3 text-sm leading-7 sm:grid-cols-2">{[
                ['用途与单位',parameter.meaning],['变动影响',parameter.effect],['声明范围与关联约束',parameter.constraints],['建议与验证方向',parameter.suggestion],
            ].map(([label,text])=><div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="whitespace-pre-wrap break-words text-slate-700">{text||'报告未提供，需补充核对。'}</dd></div>)}</dl>
            <ParameterSource parameter={parameter}/>
            <details className="text-xs leading-6 text-slate-600"><summary className="cursor-pointer">查看参数原文依据</summary><p className="mt-2 whitespace-pre-wrap break-words">{parameter.evidence||'未提供可定位依据。'}</p></details>
        </article>)}
    </section>;
}
