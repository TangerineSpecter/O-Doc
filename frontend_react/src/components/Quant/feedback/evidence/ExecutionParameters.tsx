import type {QuantExecutionParameterComparison, QuantExecutionProvenance} from '../../../../types/api/quantPlatformEvidence';
import {ExecutionProvenance} from './ExecutionProvenance';
import {EvidenceRows} from './EvidenceRows';

const statuses = {same: '与默认值相同', different: '与默认值不同', type_mismatch: '类型或范围待核对', default_unknown: '默认值未知', unknown_type: '声明类型待核对', unmatched: '未匹配源码声明', ambiguous: '声明存在歧义', unresolved:'源码映射尚未解决',constraint_mismatch:'不符已识别声明约束',literal_same:'与初始赋值相同',literal_differs:'与初始赋值不同'};
export function ExecutionParameters({parameters, comparison}: {parameters: {name: string; value: string; unit: string; ref: string; provenance?: QuantExecutionProvenance}[]; comparison?: QuantExecutionParameterComparison}) {
    return <details className="rounded-xl border border-slate-200 p-4" open={parameters.length > 0}>
        <summary className="cursor-pointer text-sm font-semibold">报告声明的运行参数 · {parameters.length} 项</summary><p className="mt-3 text-xs leading-6 text-slate-500">保留报告中的原名和原值。这是平台报告的声明，尚无独立运行证明；源码默认值与配置文件值均不用于补齐实际输入。</p>
        {comparison?.version===2 && <p className="mt-2 text-xs leading-6 text-slate-500">源码语法对照：{comparison.source_language}。只读取可识别的声明；公开输入、函数默认形参与初始赋值分别说明，动态值和未解析内容保持未知。</p>}
        <EvidenceRows items={parameters} empty="报告没有提供结构化运行参数，不能使用源码默认值代替。" render={row => {
            const matched = comparison?.rows.find(item => item.name === row.name);
            const role=matched?.declaration?.binding_kind;
            const initial=role==='module_literal' || role==='unresolved_write';
            const roles={exposed_input:'公开输入',function_default:'函数默认形参',module_literal:'初始字面赋值，不是公开输入',transformed_input:'输入参与其他表达式，变量值未解析',unresolved_write:'存在重写，运行值未解析'};
            return <div className="space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="break-all font-mono font-medium">{row.name}</strong><span className="text-xs text-slate-500">{matched ? statuses[matched.status] : '未与源码声明核对'}</span></div><p className="break-all font-mono">报告值：{row.value}{row.unit ? ` ${row.unit}` : ''}</p>{matched && <p className="break-all text-xs text-slate-500">{initial?'源码初始赋值':'源码默认'}：{matched.declaration?.default_raw || '未知'}{matched.declaration ? ` · ${matched.declaration.type} · 第 ${matched.declaration.line} 行` : ''}{matched.default?.kind==='unknown'?' · 表达式未求值':''}</p>}
                {role && <p className="text-xs leading-6 text-slate-500">{roles[role]}{matched?.declaration?.scope && matched.declaration.scope!=='<module>'?` · ${matched.declaration.scope}`:''}。{initial?'初始值不证明运行时全程不变，修改源码赋值应形成新版本。':''}</p>}
                {comparison?.version===2 && matched?.declaration && <details className="text-xs text-slate-500"><summary className="cursor-pointer text-orange-700">查看源码声明与范围</summary>
                    {matched.declaration.declared_constraints && Object.entries(matched.declaration.declared_constraints).map(([key,value])=><p key={key} className="mt-2 break-words">{({minval:'声明最小值',maxval:'声明最大值',options:'声明选项',step:'界面调节增量（不推断最优网格）'} as Record<string,string>)[key]}：{value.raw}</p>)}
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 scrollbar-hide">{matched.declaration.quote}</pre><p className="mt-2 break-all">{matched.ref}</p></details>}
                <ExecutionProvenance value={row.provenance} reference={row.ref}/></div>;
        }}/>
        {!!comparison?.missing.length && <p className="mt-3 break-words text-xs leading-6 text-orange-700">报告未提供：{comparison.missing.map(row => row.name).join('、')}。未自动填入默认值。</p>}
        {comparison?.version===2?<details className="mt-3 text-xs leading-6 text-slate-500"><summary className="cursor-pointer text-orange-700">源码对照范围与未知项 · {comparison.limitations.length} 项</summary>{comparison.limitations.map((text,index)=><p key={index} className="mt-2">{text}</p>)}</details>:comparison?.limitations.map((text, index) => <p key={index} className="mt-2 text-xs leading-6 text-slate-500">{text}</p>)}
    </details>;
}
