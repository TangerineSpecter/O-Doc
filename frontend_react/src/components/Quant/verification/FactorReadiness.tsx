import {
    CheckCircle2,
    AlertCircle,
    XCircle,
    GitBranch,
    FileText,
    Cpu,
    Workflow,
    Clock,
} from 'lucide-react';
import type {QuantFactorData} from '../../../types/api/quant';
import type {PortableQualification} from '../../../types/api/quantVerification';
import {factorReadiness, factorRolePurpose} from '../../../utils/quantFactorReadiness';
import {factorOutputs, factorRoles} from '../factorPresentation';
import {QuantBadge, QuantButton} from '../ui';
import {QuantCollapsible} from './QuantCollapsible';

const operators: Record<string, string> = {
    sub: '相减',
    add: '相加',
    mul: '相乘',
    div: '相除',
    lag: '取历史值',
    sma: '移动平均',
    sum: '窗口求和',
    std: '标准差',
    highest: '窗口最大值',
    lowest: '窗口最小值',
    ts_rank: '窗口排名',
    gt: '大于',
    lt: '小于',
    eq: '等于',
    and: '同时满足',
    or: '满足任一',
    gate: '条件门控',
    abs: '绝对值',
    sqrt: '平方根',
    neg: '取负值',
    log: '对数',
};

function ExpressionBranch({
    nodes,
    id = 'root',
    ancestors = [],
}: {
    nodes: PortableQualification['nodes'];
    id?: string;
    ancestors?: string[];
}) {
    const node = nodes.find(row => row.id === id);
    if (!node || ancestors.includes(id) || ancestors.length > 20) {
        return <li className="text-xs text-rose-600">计算节点缺失或层级异常，请核对完整结构检查。</li>;
    }

    const isInput = node.op === 'input';
    const isParam = node.op === 'parameter';
    const isConst = node.op === 'constant';
    const opText = operators[node.op] || node.op;

    return (
        <li className="relative py-1">
            <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2 py-1 text-xs shadow-2xs">
                {isInput ? (
                    <>
                        <span className="rounded bg-orange-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-orange-700">
                            输入
                        </span>
                        <span className="font-mono font-medium text-slate-800">{node.name}</span>
                    </>
                ) : isParam ? (
                    <>
                        <span className="rounded bg-sky-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-sky-700">
                            参数
                        </span>
                        <span className="font-mono font-medium text-slate-800">{node.name}</span>
                    </>
                ) : isConst ? (
                    <span className="text-slate-600">常量（值见公式）</span>
                ) : (
                    <>
                        <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                            算子
                        </span>
                        <span className="font-medium text-slate-800">{opText}</span>
                    </>
                )}
                {node.name && !isInput && !isParam && (
                    <span className="text-[11px] text-slate-400">({node.name})</span>
                )}
            </div>
            {node.dependencies.length > 0 && (
                <ul className="ml-3 mt-1.5 space-y-1 border-l-2 border-slate-200 pl-3">
                    {node.dependencies.map(child => (
                        <ExpressionBranch
                            key={child}
                            nodes={nodes}
                            id={child}
                            ancestors={[...ancestors, id]}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

export function FactorReadiness({
    value,
    definition,
    openSource,
    openVersions,
}: {
    value: PortableQualification;
    definition?: QuantFactorData;
    openSource?: () => void;
    openVersions?: () => void;
}) {
    const readiness = factorReadiness(value);
    const usedInputs = value.inputs.filter(row => row.used);
    const hasTree = value.nodes.length > 0;
    const hasBlockers = value.blockers.length > 0;
    const isReady = value.automatic_experiment_ready;

    return (
        <section className="space-y-4" aria-label="计算条件与就绪状态">
            {/* 核心状态 Banner */}
            <div
                className={`rounded-2xl border p-4 transition-all duration-200 sm:p-5 ${
                    hasBlockers
                        ? 'border-rose-200/90 bg-rose-50/40 shadow-xs'
                        : isReady
                          ? 'border-emerald-200/90 bg-emerald-50/40 shadow-xs'
                          : 'border-amber-200/90 bg-amber-50/40 shadow-xs'
                }`}
            >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div
                            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-2xs ${
                                hasBlockers
                                    ? 'bg-rose-100 text-rose-600'
                                    : isReady
                                      ? 'bg-emerald-100 text-emerald-600'
                                      : 'bg-amber-100 text-amber-600'
                            }`}
                        >
                            {hasBlockers ? (
                                <XCircle size={20} />
                            ) : isReady ? (
                                <CheckCircle2 size={20} />
                            ) : (
                                <AlertCircle size={20} />
                            )}
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-base font-bold text-slate-900">{readiness.title}</h4>
                                <QuantBadge
                                    tone={hasBlockers ? 'red' : isReady ? 'emerald' : 'amber'}
                                    className="font-medium"
                                >
                                    {hasBlockers ? '存在阻断' : isReady ? '就绪可实验' : '运行条件待确认'}
                                </QuantBadge>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                                {hasBlockers
                                    ? `存在阻断项（${value.blockers.join('、')}），必须先消除阻断项才能用于实验。`
                                    : isReady
                                      ? '受控表达式与运行依赖完整，已具备发起受控实验条件。'
                                      : '公式受控结构已保存，需补充输入时点映射或运行默认值后再行实际计算。'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* 角色与用途声明 */}
                {definition && (
                    <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-200/60 pt-3 text-xs">
                        <QuantBadge tone="orange">{factorRoles[definition.role]}</QuantBadge>
                        <span className="text-slate-600">{factorRolePurpose[definition.role]}</span>
                    </div>
                )}

                {/* 状态维度徽章矩阵 */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <QuantBadge tone={value.reuse_status === 'reusable' ? 'emerald' : 'amber'}>
                        {value.reuse_status === 'reusable' ? '受控表达式可复用' : '结构检查待补齐'}
                    </QuantBadge>
                    <QuantBadge
                        tone={
                            value.configuration.status === 'declared_defaults_valid'
                                ? 'emerald'
                                : value.configuration.status === 'needs_values'
                                  ? 'amber'
                                  : 'red'
                        }
                    >
                        {value.configuration.status === 'declared_defaults_valid'
                            ? '默认参数有效'
                            : value.configuration.status === 'needs_values'
                              ? '缺少默认值'
                              : '默认参数需修订'}
                    </QuantBadge>
                    <QuantBadge tone="slate">原平台等价性未验证</QuantBadge>
                    <QuantBadge tone="slate">经济有效性未评估</QuantBadge>
                    {definition && (
                        <QuantBadge tone="slate">
                            输出：{factorOutputs[definition.outputType]} ({definition.units})
                        </QuantBadge>
                    )}
                </div>
            </div>

            {/* 下一步待办步骤卡片 */}
            {readiness.steps.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-amber-200/80 bg-amber-50/30 p-4">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Clock size={16} className="text-amber-600" />
                            <span className="text-xs font-bold text-amber-950 sm:text-sm">
                                建议修订与准备步骤（{readiness.steps.length} 项）
                            </span>
                        </div>
                        <span className="text-[11px] text-amber-700/80">完成待办后可发起实验</span>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                        {readiness.steps.map((step, index) => (
                            <div
                                key={`${step.title}-${index}`}
                                className="flex flex-col justify-between rounded-xl border border-amber-200/70 bg-white p-3 shadow-2xs"
                            >
                                <div>
                                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                                            {index + 1}
                                        </span>
                                        <span className="text-xs sm:text-sm">{step.title}</span>
                                    </div>
                                    <p className="mt-2 text-xs text-slate-600 leading-relaxed break-words">
                                        {step.detail}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 行动快捷按钮 */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        {openVersions && readiness.steps.some(step => step.action !== 'source') && (
                            <QuantButton size="sm" onClick={openVersions} primary>
                                <GitBranch size={13} className="shrink-0" />
                                <span>查看或修订公式版本</span>
                            </QuantButton>
                        )}
                        {openSource && (
                            <QuantButton size="sm" onClick={openSource}>
                                <FileText size={13} className="shrink-0 text-slate-500" />
                                <span>核对来源报告与源码</span>
                            </QuantButton>
                        )}
                    </div>
                </div>
            )}

            {/* 计算依赖折叠块 */}
            <QuantCollapsible
                title={`计算依赖 · ${hasTree ? '按受控表达式展开' : '尚未建立'}`}
                badge={
                    hasTree ? (
                        <QuantBadge tone="emerald" className="px-1.5 py-0 text-[10px]">
                            受控表达式已建立
                        </QuantBadge>
                    ) : (
                        <QuantBadge tone="amber" className="px-1.5 py-0 text-[10px]">
                            受控表达式未建立
                        </QuantBadge>
                    )
                }
                icon={Workflow}
                defaultOpen={true}
                className="border-slate-200/90"
            >
                <div className="space-y-4 text-xs leading-6 text-slate-600">
                    {/* 输入依赖 */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-semibold text-slate-800">输入变量</span>
                            <span className="text-slate-400">
                                {hasTree ? `表达式已引用 ${usedInputs.length} 项` : '仅有声明'}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {(hasTree ? usedInputs : value.inputs).map(row => (
                                <span
                                    key={row.name}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 shadow-2xs"
                                >
                                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                    {row.name}
                                </span>
                            ))}
                            {!value.inputs.length && <span className="text-slate-400">未声明输入变量</span>}
                        </div>
                        {!hasTree && (
                            <p className="mt-1 text-[11px] text-amber-700">
                                注：当前仅有文本声明，引用关系与数据可用性尚未核对。
                            </p>
                        )}
                    </div>

                    {/* 表达式树分支 */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-semibold text-slate-800">计算链路结构</span>
                            {hasTree && <span className="text-slate-400">按 AST 语法展开</span>}
                        </div>
                        {hasTree ? (
                            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 scrollbar-hide">
                                <ul className="space-y-1">
                                    <ExpressionBranch nodes={value.nodes} />
                                </ul>
                            </div>
                        ) : (
                            <div className="flex items-start gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-slate-600 leading-relaxed">
                                <Cpu size={16} className="mt-0.5 shrink-0 text-slate-400" />
                                <span>
                                    缺少受控表达式，不能从变量名或语义相似关系推断计算链路。内部状态须回到源码核对。
                                </span>
                            </div>
                        )}
                    </div>

                    {/* 输出与外部依赖 */}
                    <div className="grid gap-3 pt-1 sm:grid-cols-2">
                        {definition && (
                            <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-3">
                                <span className="font-semibold text-slate-700">输出声明：</span>
                                <div className="mt-1 text-slate-800">
                                    {factorOutputs[definition.outputType]} · 单位：
                                    <span className="font-mono">{definition.units || '未指定'}</span>
                                </div>
                            </div>
                        )}
                        {value.external_dependencies.length > 0 && (
                            <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-3">
                                <span className="font-semibold text-slate-700">外部依赖声明：</span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {value.external_dependencies.map(row => (
                                        <span
                                            key={row.name}
                                            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700"
                                        >
                                            {row.name}
                                        </span>
                                    ))}
                                </div>
                                <p className="mt-1 text-[11px] text-slate-400">尚未验证原平台依赖语义。</p>
                            </div>
                        )}
                    </div>
                </div>
            </QuantCollapsible>
        </section>
    );
}
