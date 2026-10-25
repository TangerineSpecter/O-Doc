import type {QuantParameterConfiguration, QuantParameterComparison} from '../../../types/api/quantParameters';

const statuses = {same: '与默认值相同', different: '与默认值不同', type_mismatch: '类型或范围不符', default_unknown: '默认值未知', unknown_type: '类型待核对', unmatched: '未匹配声明', ambiguous: '参数解释有歧义'};

export function ParameterConfiguration({configuration, comparison}: {configuration: QuantParameterConfiguration; comparison?: QuantParameterComparison}) {
    return <section className="space-y-3 rounded-xl border border-slate-200 p-4" aria-label="参数配置对照">
        <h3 className="font-semibold text-slate-800">文件配置 · {configuration.parameters.length} 个参数</h3>
        <p className="text-xs leading-6 text-slate-500">配置文件不证明这些值已用于运行。优化范围单独显示，不作为已验证的推荐范围。</p>
        <div className="max-h-96 divide-y divide-slate-100 overflow-auto scrollbar-hide">{configuration.parameters.map(row => {
            const matched = comparison?.rows.find(item => item.name === row.name);
            return <div key={row.name} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><strong className="break-all font-mono font-medium">{row.name}</strong><span className={matched?.status === 'different' || matched?.status === 'type_mismatch' ? 'text-orange-700' : 'text-slate-500'}>{matched ? statuses[matched.status] : '等待与来源对照'}</span></div>
                <div className="grid gap-2 sm:grid-cols-2"><p className="break-all">文件值：<span className="font-mono">{row.rawValue || '空字符串'}</span></p><p className="break-all text-slate-600">源码默认：<span className="font-mono">{matched?.declaration?.defaultRaw || '未知'}</span>{matched?.declaration && ` · ${matched.declaration.type}`}</p></div>
                {row.optimization && <p className="text-xs leading-6 text-slate-500">优化：{row.optimization.enabled === null ? '开关未知' : row.optimization.enabled ? '启用' : '关闭'}；起点 {row.optimization.start ?? '未知'}，步长 {row.optimization.step ?? '未知'}，终点 {row.optimization.stop ?? '未知'}</p>}
                <details className="text-xs text-slate-500"><summary className="cursor-pointer">原文依据 · 配置第 {row.line} 行{matched?.declaration ? ` / 源码第 ${matched.declaration.line} 行` : ''}</summary><pre className="mt-2 whitespace-pre-wrap break-all leading-6">{row.quote}{matched?.declaration ? `\n${matched.declaration.quote}` : ''}</pre></details>
            </div>;
        })}</div>
        {!!comparison?.missing.length && <p className="text-sm text-orange-700">文件未提供：{comparison.missing.map(row => row.name).join('、')}。不自动用源码默认值补齐。</p>}
        {configuration.warnings.map((row, index) => <p key={index} className="text-xs text-orange-700">第 {row.line} 行：{row.message}</p>)}
        {comparison && <details className="text-xs leading-6 text-slate-500"><summary className="cursor-pointer">匹配范围与限制</summary>{comparison.limitations.map((text, index) => <p key={index}>{text}</p>)}</details>}
    </section>;
}
