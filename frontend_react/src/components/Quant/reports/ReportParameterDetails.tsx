import type {QuantReport} from '../../../types/api/quant';
import {ReportParameters} from './ReportParameters';
import {ParameterConfiguration} from '../feedback/ParameterConfiguration';

/** Read the saved report fields; never fill an actual configuration from defaults. */
export function ReportParameterDetails({report}: {report: QuantReport}) {
    const data = report.data;
    if (report.schemaVersion === 4) return <section aria-label="实验参数分析" className="space-y-4">
        <p className="text-xs leading-6 text-slate-500">以下是本份实验报告的 AI 参数结论。具体取值与成本以原实验记录为准；有结论不代表已经找到最优参数。</p>
        {data.parameterAssessment?.length ? data.parameterAssessment.map((row, index) => <article key={index} className="space-y-2 rounded-xl border border-slate-200 p-4">
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{row.text}</p>
            <p className="break-words text-xs leading-6 text-slate-500">实验依据：{row.evidenceRefs.join('、') || '未提供具体引用'}</p>
        </article>) : <p className="text-sm leading-7 text-slate-500">这份历史报告没有单独保存参数结论，请在报告正文及原实验中查看。</p>}
        {report.proposal && <a href={`#quant-report-plan-${report.id}`} className="inline-block text-sm font-medium text-orange-600 underline underline-offset-4">查看下一轮 AI 参数与实验方案</a>}
    </section>;
    if (report.schemaVersion === 5) {
        const native = data.nativeReview;
        const hasValues = !!data.reportedParameters?.length || !!native?.actualParameters.length;
        return <section aria-label="反馈参数分析" className="space-y-4">
            <p className="text-xs leading-6 text-slate-500">来源报告、配置文件和本机运行的参数分别展示。文件值不证明已实际运行；缺失值不使用源码默认值补齐。</p>
            {data.parameterConfiguration && <ParameterConfiguration configuration={data.parameterConfiguration} comparison={data.parameterComparison}/>}
            {!!data.reportedParameters?.length && <div className="space-y-3"><h3 className="text-sm font-semibold text-slate-800">报告声明的参数</h3>{data.reportedParameters.map((row, index) => <article key={index} className="space-y-2 rounded-xl border border-slate-200 p-4">
                <p className="break-words text-sm text-slate-700"><span className="font-mono">{row.name} = {row.value}</span>{row.unit && ` ${row.unit}`}</p>
                <p className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-500">原文依据：{row.quote}</p>
            </article>)}</div>}
            {native && <div className="space-y-3"><h3 className="text-sm font-semibold text-slate-800">本机验证记录的参数</h3>
                {native.actualParameters.map((row, index) => <p key={index} className="break-words rounded-xl bg-slate-50 p-3 font-mono text-sm text-slate-700">{row.name} = {JSON.stringify(row.value)}</p>)}
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{native.parameterAssessment}</p>
            </div>}
            {data.computedExecutionJson && <a href={`#quant-report-execution-${report.id}`} className="inline-block text-sm font-medium text-orange-600 underline underline-offset-4">查看完整执行证据中的参数与源码对照</a>}
            {!hasValues && !data.parameterConfiguration && !data.computedExecutionJson && <p className="text-sm leading-7 text-slate-500">这份反馈未保存可单独展示的参数记录，不能解释为没有参数；已有说明仍保留在正文。</p>}
        </section>;
    }
    return <ReportParameters parameters={data.parameters}/>;
}
