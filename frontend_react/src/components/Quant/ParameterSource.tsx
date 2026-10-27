import type {QuantAnalysis} from '../../types/api/quant';

const kinds: Record<string, string> = {exposed_input: '公开输入', function_default: '函数默认', function_argument: '必填形参',
    variadic_argument: '可变形参', module_assignment: '模块初始声明', class_assignment: '类内声明', function_assignment: '局部声明',
    module_literal: '模块字面初值', formula_assignment: '公式计算状态', formula_output: '公式输出', external_parameter: '外部参数表定义', transformed_input: '变换后的输入'};

export function ParameterSource({parameter}: {parameter: QuantAnalysis['parameters'][number]}) {
    const origin = parameter.sourceBinding;
    if (!origin) return null;
    if (origin.status !== 'resolved') return <p className="break-words text-xs leading-6 text-amber-700">{origin.status === 'hypothesis' ? '新增实验假设' : '源码身份未定位'}：{origin.reason}</p>;
    return <div className="min-w-0 space-y-1 break-words rounded-lg bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-500" aria-label="参数源码身份">
        <p>{kinds[origin.kind] || origin.kind} · {origin.kind === 'external_parameter' && origin.scope !== '<external_parameters:file>' ? '参数表原文' : '完整来源'}第 {origin.line}–{origin.endLine} 行{origin.conditional ? ' · 条件内声明，是否生效未知' : ''}</p>
        <p>原始默认表达式：<code className="break-all">{origin.defaultRaw || '无默认值'}</code>。声明初值、实际运行值与实验候选值分别记录。</p>
        {origin.literal.kind === 'unknown' && <p className="text-amber-700">变量默认值未能静态确定；上面仅保留原输入或声明片段。</p>}
        <details><summary className="cursor-pointer">查看声明与实验标识</summary><p className="mt-2 break-all">实验标识：{parameter.name}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all scrollbar-hide">{origin.quote}</pre></details>
    </div>;
}
