import type {QuantTemporalSensitivity, TemporalParameterGroup, TemporalParameters, TemporalRegion} from '../../../types/api/quantTemporalSensitivity';
import {attemptNames, percent} from './readout';
const names = {sampled_region: '存在待新数据复核的共同候选', no_supported_region: '有完整对照，尚无共同稳定区域', insufficient_comparison: '共同完整对照不足，保留未知'};
const parameters = (value: number | TemporalParameters) => typeof value === 'number' ? String(value) : Object.entries(value).map(([name, item]) => `${name}=${JSON.stringify(item)}`).join('，');
const region = (value: TemporalRegion) => Object.entries(value).map(([name, levels]) => `${name} ∈ {${levels.join('、')}}`).join('；');

function Group({value, label, selectAttempt}: {value: TemporalParameterGroup; label: string; selectAttempt: (id: string) => void}) {
    return <div className="space-y-3 border-t border-slate-100 pt-3"><h6 className="break-words text-sm font-medium text-slate-800">{label}</h6>
        <p className="text-xs leading-6 text-slate-600">{names[value.status]}</p>
        {value.regions.map((item, index) => <p key={index} className="break-words text-xs leading-6 text-slate-700">全部窗口共同支持的已测离散值：{region(item)}。仅这些实际组合，未测中间值仍未知。</p>)}
        <details className="text-xs leading-6"><summary className="cursor-pointer py-2 text-slate-700">查看全部 {value.windows.length} 个窗口的对照、缺测与失败</summary>
            <div className="max-h-96 space-y-3 overflow-y-auto scrollbar-hide">{value.windows.map(window => <details key={`${window.outer_fold}-${window.inner_fold}`} className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-slate-700">第 {window.outer_fold} 外折 · 内层 {window.inner_fold} · 可比较 {window.points.filter(point => point.comparable).length}/{window.points.length} 点 · 通过单点规则 {window.points.filter(point => point.eligible).length} 点</summary>
                <p className="mt-2 text-slate-600">验证区间：{window.ranges.validation ? `${window.ranges.validation.start} → ${window.ranges.validation.end}` : '尚无已记录的验证区间'}；时间沿用原行情口径。</p>
                <p className="mt-2 break-words text-slate-600">{window.baseline_attempt_id ? <>实际参考：<button onClick={() => selectAttempt(window.baseline_attempt_id)} className="text-orange-700 underline-offset-4 hover:underline">{window.baseline_attempt_id}</button></> : '实际参考缺失，不能借用其他窗口或模式。'}{window.supported_values.length ? `；本窗候选：${window.supported_values.map(region).join('；')}` : '；本窗没有通过规则的区段。'}</p>
                <div className="mt-2 overflow-x-auto scrollbar-hide"><table className="w-full text-right tabular-nums"><caption className="sr-only">第{window.outer_fold}外折内层{window.inner_fold}参数对照</caption><thead><tr>{['参数与尝试', '训练收益', '验证收益', '验证回撤'].map((title,index) => <th key={title} className={`whitespace-nowrap border-b border-slate-200 px-2 py-3 font-medium text-slate-600 ${index===0?'text-left':''}`}>{title}</th>)}</tr></thead>
                    <tbody>{window.points.map((point, index) => <tr key={index}><td className="min-w-44 max-w-sm break-words px-2 py-3 text-left"><p>{parameters(point.value)}</p>{point.attempt_id && <button onClick={() => selectAttempt(point.attempt_id)} className="text-orange-700 underline-offset-4 hover:underline">{point.attempt_id}</button>}<p className="text-slate-600">{point.status === 'not_run' ? '未执行' : attemptNames[point.status] || point.status} · {point.eligibility_reasons.join('；') || '通过单点规则'}</p>{point.reason && <p className="text-slate-600">{point.reason}</p>}</td><td className="whitespace-nowrap px-2">{percent(point.metrics.train?.total_return)}</td><td className="whitespace-nowrap px-2">{percent(point.metrics.validation?.total_return)}</td><td className="whitespace-nowrap px-2">{percent(point.metrics.validation?.max_drawdown)}</td></tr>)}</tbody>
                </table></div>
            </details>)}</div>
        </details>
    </div>;
}

export function TemporalParameterStability({value, demo, selectAttempt}: {value?: QuantTemporalSensitivity; demo: boolean; selectAttempt: (id: string) => void}) {
    if (!value) return null;
    return <section className="min-w-0 space-y-4" aria-label="全部内层窗口参数复核"><h4 className="text-sm font-semibold text-slate-800">全部内层窗口的参数复核</h4>
        <p className="text-sm leading-6 text-slate-700">{value.outer_folds} 个外折 × 每折 {value.inner_folds} 个内层 = {value.planned_windows} 个计划窗口。{names[value.status]}。</p>
        <p className="text-xs leading-6 text-slate-600">逐窗检查后取共同离散集合，不以最后一窗或平均值掩盖失败；外层测试不参与区段筛选。{demo && '当前为人工 local 样例，未计算行情，不代表真实参数推荐。'}</p>
        {value.families.map(family => <div key={family.seed_id} className="space-y-3 rounded-xl border border-slate-200 p-4"><h5 className="break-words text-sm font-medium text-slate-800">{family.name}</h5><p className="break-words text-xs leading-6 text-slate-600">本轮实际基线：{parameters(family.baseline_parameters)}；声明默认值仍以原报告为准。</p>
            {!family.axes.length && !family.contexts.length && <p className="text-xs leading-6 text-slate-600">尚无可比较的数值信号参数邻域或完整联合计划。</p>}
            {family.axes.map(axis => <Group key={axis.parameter} value={axis} label={`${axis.parameter} · 实际基线 ${axis.baseline_value}`} selectAttempt={selectAttempt}/>)}
            {family.contexts.map(context => <Group key={context.context_id} value={context} label={`联合参数 ${context.axes.join('、')}${Object.keys(context.fixed_parameters).length ? `；固定 ${parameters(context.fixed_parameters)}` : ''}`} selectAttempt={selectAttempt}/>)}
        </div>)}
        <details className="text-xs leading-6 text-slate-600"><summary className="cursor-pointer py-2">共同区域规则与适用边界</summary>{value.limitations.map(text => <p key={text}>{text}</p>)}<p>新版AI参数稳定性评分：缺少全部窗口共同完整对照时为未知；有对照但没有共同支持区域时最多 {value.maximum_score_without_common_region}/5 分。评分不等于盈利能力。</p></details>
    </section>;
}
