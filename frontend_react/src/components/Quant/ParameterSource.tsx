import { useState } from 'react';
import { ChevronDown, Code2 } from 'lucide-react';
import type { QuantAnalysis } from '../../types/api/quant';

const kinds: Record<string, string> = {
    exposed_input: '公开输入',
    function_default: '函数默认',
    function_argument: '必填形参',
    variadic_argument: '可变形参',
    module_assignment: '模块初始声明',
    class_assignment: '类内声明',
    function_assignment: '局部声明',
    module_literal: '模块字面初值',
    formula_assignment: '公式计算状态',
    formula_output: '公式输出',
    external_parameter: '外部参数表定义',
    transformed_input: '变换后的输入',
};

export function ParameterSource({ parameter }: { parameter: QuantAnalysis['parameters'][number] }) {
    const [showSnippet, setShowSnippet] = useState(false);
    const origin = parameter.sourceBinding;
    if (!origin) return null;

    if (origin.status !== 'resolved') {
        return (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3 text-xs leading-6 text-amber-800">
                <span className="font-semibold">
                    {origin.status === 'hypothesis' ? '新增实验假设' : '源码身份未定位'}：
                </span>
                {origin.reason}
            </div>
        );
    }

    const scopeText = origin.kind === 'external_parameter' && origin.scope !== '<external_parameters:file>' ? '参数表原文' : '完整来源';
    const kindLabel = kinds[origin.kind] || origin.kind;

    return (
        <div className="min-w-0 space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs leading-6 text-slate-600" aria-label="参数源码身份">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-800">
                    <Code2 size={13} className="text-slate-500 shrink-0" />
                    <span>源码身份：</span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {kindLabel}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">
                        {scopeText} 第 {origin.line}–{origin.endLine} 行
                    </span>
                    {origin.conditional && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[11px] font-medium text-amber-800">
                            条件内声明
                        </span>
                    )}
                </div>
                {origin.quote && (
                    <button
                        type="button"
                        onClick={() => setShowSnippet(prev => !prev)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-orange-600 transition-colors"
                    >
                        <span>{showSnippet ? '收起源码片段' : '查看源码片段'}</span>
                        <ChevronDown size={12} className={`transform transition-transform duration-200 ${showSnippet ? 'rotate-180 text-orange-500' : ''}`} />
                    </button>
                )}
            </div>

            <div className="space-y-1">
                <p>
                    <span className="text-slate-500">原始默认表达式：</span>
                    <code className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800 break-all">
                        {origin.defaultRaw || '无默认值'}
                    </code>
                    <span className="ml-1 text-slate-400 text-[11px]">（声明初值、实际运行值与实验候选值分别记录）</span>
                </p>
                {origin.literal.kind === 'unknown' && (
                    <p className="text-amber-700">变量默认值未能静态确定；上面仅保留原输入或声明片段。</p>
                )}
            </div>

            {showSnippet && origin.quote && (
                <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>实验标识：{parameter.name}</span>
                        {origin.file && <span>{origin.file}</span>}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-[11px] leading-5 text-slate-700 scrollbar-hide">
                        {origin.quote}
                    </pre>
                </div>
            )}
        </div>
    );
}
