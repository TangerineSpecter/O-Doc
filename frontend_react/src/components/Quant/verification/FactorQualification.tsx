import {CheckCircle2, AlertTriangle, XCircle, Layers, Database, ShieldAlert, Cpu} from 'lucide-react';
import type {PortableQualification} from '../../../types/api/quantVerification';
import {QuantBadge} from '../ui';
import {QuantCollapsible} from './QuantCollapsible';

const configStatusMap: Record<
    PortableQualification['configuration']['status'],
    {text: string; tone: 'emerald' | 'amber' | 'red'}
> = {
    declared_defaults_valid: {text: '符合已识别的声明约束', tone: 'emerald'},
    needs_values: {text: '缺少默认值，运行时需明确提供', tone: 'amber'},
    invalid_declared_defaults: {text: '不满足已识别约束，需要修订', tone: 'red'},
};

export function FactorQualification({value}: {value: PortableQualification}) {
    const configStatus = configStatusMap[value.configuration.status];
    const missingFields = value.configuration.missing;

    return (
        <div className="space-y-4 text-xs leading-6 text-slate-600">
            {/* 检查项列表 */}
            <div>
                <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">契约与语法检查</span>
                    <span className="text-slate-400">共 {value.checks.length} 项检查</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                    {value.checks.map(row => {
                        const isPass = row.status === 'passed';
                        const isMissing = row.status === 'missing';
                        return (
                            <div
                                key={row.code}
                                className={`flex items-start gap-2.5 rounded-xl border p-3 transition-colors ${
                                    isPass
                                        ? 'border-slate-200/80 bg-slate-50/50 hover:bg-slate-50'
                                        : isMissing
                                          ? 'border-amber-200/80 bg-amber-50/40'
                                          : 'border-rose-200/80 bg-rose-50/40'
                                }`}
                            >
                                {isPass ? (
                                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                                ) : isMissing ? (
                                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                                ) : (
                                    <XCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 font-medium">
                                        <QuantBadge
                                            tone={isPass ? 'emerald' : isMissing ? 'amber' : 'red'}
                                            className="px-1.5 py-0 text-[10px]"
                                        >
                                            {isPass ? '通过' : isMissing ? '缺失' : '阻断'}
                                        </QuantBadge>
                                        <span className="font-mono text-[11px] text-slate-500">{row.code}</span>
                                    </div>
                                    <p className="mt-1 text-slate-700 leading-relaxed">{row.message}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 配置与映射警示卡片 */}
            <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                    <span className="font-medium text-slate-700">声明默认配置：</span>
                    <QuantBadge tone={configStatus.tone}>{configStatus.text}</QuantBadge>
                    {missingFields.length > 0 && (
                        <span className="font-mono text-amber-700">（缺失：{missingFields.join('、')}）</span>
                    )}
                </div>

                {value.inputs_requiring_mapping.length > 0 && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-amber-900">
                        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
                        <div className="leading-relaxed">
                            <span className="font-bold">需明确数据映射：</span>
                            <span className="mx-1 font-mono font-semibold underline decoration-amber-400">
                                {value.inputs_requiring_mapping.join('、')}
                            </span>
                            <span>。系统不会自动使用收盘价替代这些输入，需补充明确映射或计算定义。</span>
                        </div>
                    </div>
                )}

                <div className="rounded-xl border border-slate-200/70 bg-white p-3 text-slate-500 leading-relaxed shadow-2xs">
                    输入可得时点、缺失规则和单位仍按定义声明保留；量纲含义、实际数据可得性及跨平台语义需另行核对。
                </div>
            </div>

            {/* 深入依赖与 AST 节点折叠 */}
            <QuantCollapsible
                title="声明依赖、数据时点与表达式结构"
                subtitle={`包含 ${value.inputs.length} 个输入声明、${value.external_dependencies.length} 个外部依赖及 AST 节点`}
                icon={Layers}
                className="border-slate-200/70"
            >
                <div className="space-y-4 pt-1">
                    {/* 输入声明详情 */}
                    <div>
                        <div className="mb-2 flex items-center gap-1.5 font-semibold text-slate-700">
                            <Database size={14} className="text-slate-500" />
                            <span>输入变量与时点契约</span>
                        </div>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            {value.inputs.map(row => (
                                <div
                                    key={row.name}
                                    className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-2.5 leading-relaxed"
                                >
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="font-mono font-bold text-orange-700">{row.name}</span>
                                        <QuantBadge
                                            tone={!value.nodes.length ? 'amber' : row.used ? 'emerald' : 'slate'}
                                            className="px-1.5 py-0 text-[10px]"
                                        >
                                            {!value.nodes.length ? '待核对' : row.used ? '已引用' : '未引用'}
                                        </QuantBadge>
                                    </div>
                                    <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-600">
                                        <p>可得时点：{row.availability || '未声明'}</p>
                                        <p>缺失策略：{row.missing_policy || '未声明'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 外部依赖 */}
                    <div>
                        <div className="mb-1.5 font-semibold text-slate-700">原平台或资料外部依赖声明</div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {value.external_dependencies.length ? (
                                value.external_dependencies.map(row => (
                                    <span
                                        key={row.name}
                                        className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700"
                                    >
                                        {row.name}
                                    </span>
                                ))
                            ) : (
                                <span className="text-slate-400">未列出外部依赖</span>
                            )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                            注：文字依赖声明仍待核实；当前结构检查仅进行语法校验，不加载外部库或验证其实际语义。
                        </p>
                    </div>

                    {/* AST 语法树节点 */}
                    {value.nodes.length > 0 && (
                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                                    <Cpu size={14} className="text-slate-500" />
                                    <span>受控 AST 语法节点 ({value.nodes.length})</span>
                                </span>
                            </div>
                            <ol className="max-h-56 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] text-slate-200 scrollbar-hide">
                                {value.nodes.map(node => (
                                    <li key={node.id} className="flex flex-wrap items-center gap-1.5 leading-5">
                                        <span className="text-orange-400 font-bold">{node.id}</span>
                                        <span className="text-slate-500">·</span>
                                        <span className="text-sky-300 font-semibold">{node.op}</span>
                                        {node.name && <span className="text-amber-300">({node.name})</span>}
                                        <span className="text-slate-500">→</span>
                                        <span className="text-slate-400">{node.kind}</span>
                                        {node.dependencies.length > 0 && (
                                            <span className="text-emerald-400">
                                                ← [{node.dependencies.join(', ')}]
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>
            </QuantCollapsible>
        </div>
    );
}
