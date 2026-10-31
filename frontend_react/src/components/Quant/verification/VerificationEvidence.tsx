import {
    Calendar,
    Fingerprint,
    ExternalLink,
} from 'lucide-react';
import {StrategySummary, StrategyLedger} from '../experiments/StrategyResults';
import {readStrategy} from '../../../utils/quantStrategy';
import {readStrategyExecution} from '../../../utils/quantStrategyExecution';
import type {DirectVerification, VerificationMetrics} from '../../../types/api/quantVerification';
import {feedbackModes} from '../../../types/api/quantFeedback';
import {quantDate} from '../../../utils/quant';
import {QuantBadge, QuantButton} from '../ui';
import {RegisteredCriteriaResult} from '../validations/RegisteredCriteriaResult';
import {nativeReasonLabels, nativeVerdictLabels} from '../../../utils/quantNativePython';
import {QuantCollapsible} from './QuantCollapsible';

const percent = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '未提供';

const status: Record<string, string> = {
    evaluated: '已计算',
    rejected: '未通过',
    cancelled: '已停止',
    budget_stopped: '预算停止',
    completed: '已完成',
    partial: '部分完成',
    failed: '失败',
};

const kindMeta: Record<
    DirectVerification['kind'],
    {label: string; tone: 'purple' | 'orange' | 'blue' | 'emerald' | 'slate'}
> = {
    native_python: {label: '原始Python函数验证', tone: 'purple'},
    experiment: {label: '本机受控实验', tone: 'orange'},
    fixed_validation: {label: '登记后固定验证', tone: 'blue'},
    comparison: {label: '固定样本对照', tone: 'emerald'},
    feedback: {label: '用户提供观察', tone: 'slate'},
};

function MetricPill({
    label,
    value,
    highlight,
}: {
    label: string;
    value: string;
    highlight?: 'green' | 'red' | 'amber' | 'slate';
}) {
    const toneClasses = {
        green: 'text-emerald-700 bg-emerald-50 border-emerald-200/80',
        red: 'text-rose-700 bg-rose-50 border-rose-200/80',
        amber: 'text-amber-700 bg-amber-50 border-amber-200/80',
        slate: 'text-slate-700 bg-slate-50 border-slate-200/80',
    };
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-2xs ${
                toneClasses[highlight || 'slate']
            }`}
        >
            <span className="text-slate-500 font-normal">{label}:</span>
            <span className="font-mono font-semibold">{value}</span>
        </span>
    );
}

function MetricsView({value}: {value?: VerificationMetrics}) {
    const totalReturn = value?.total_return;
    const isPositive = typeof totalReturn === 'number' && totalReturn > 0;
    const isNegative = typeof totalReturn === 'number' && totalReturn < 0;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <MetricPill
                label="净收益"
                value={percent(totalReturn)}
                highlight={isPositive ? 'green' : isNegative ? 'red' : 'slate'}
            />
            <MetricPill
                label="最大回撤"
                value={percent(value?.max_drawdown)}
                highlight="amber"
            />
            {value?.execution && (
                <>
                    <MetricPill
                        label="执行损益"
                        value={percent(value.execution.realized_pnl)}
                    />
                    <MetricPill
                        label="资金缺口"
                        value={String(value.execution.capital_deficit)}
                    />
                </>
            )}
            <MetricPill label="统计段数" value={`${value?.bars ?? '未知'} 段`} />
        </div>
    );
}

export function VerificationEvidence({
    value,
    createdAt,
    openExperiment,
    openComparison,
}: {
    value: DirectVerification;
    createdAt: string;
    openExperiment: (id: string) => void;
    openComparison?: (id: string) => void;
}) {
    const meta = kindMeta[value.kind] || {label: '其他证据记录', tone: 'slate'};

    return (
        <article className="space-y-3.5 rounded-2xl border border-slate-200/90 bg-white p-4 text-xs leading-6 text-slate-600 shadow-2xs transition-all hover:border-slate-300 sm:p-5">
            {/* 卡片头部 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                    <QuantBadge tone={meta.tone} className="px-2.5 py-0.5 font-semibold text-xs">
                        {meta.label}
                    </QuantBadge>
                    <span className="font-semibold text-slate-800 text-xs sm:text-sm">{value.claim || meta.label}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                    <Calendar size={13} />
                    <span>{quantDate(createdAt)}</span>
                </div>
            </div>

            {/* 本地样例警示 */}
            {value.local_demo && (
                <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-orange-800 leading-relaxed">
                    <span className="font-bold">人工本地样例：</span>
                    人工构造的展示样例，未计算导入行情、未调用模型或验证平台。
                </div>
            )}

            {/* 原始Python函数验证 */}
            {value.kind === 'native_python' && (
                <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">判定结果：</span>
                        <QuantBadge tone={value.verdict === 'pass' ? 'emerald' : 'amber'}>
                            {value.verdict
                                ? nativeVerdictLabels[value.verdict]
                                : nativeReasonLabels[value.reason] || value.reason || value.status}
                        </QuantBadge>
                        <span className="text-slate-500">
                            入口函数：<code className="font-mono font-bold text-slate-700">{value.native.entrypoint}</code>
                        </span>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 leading-relaxed">
                        <p>
                            数据集范围：{value.dataset.start} → {value.dataset.end} · 偏移 {value.dataset.offset} · 共{' '}
                            {value.dataset.row_count} 行
                        </p>
                        <p className="mt-1 break-words">
                            实际参数：
                            {Object.entries(value.parameters)
                                .map(([key, item]) => `${key}=${JSON.stringify(item)}`)
                                .join('，') || '无可调参数'}
                        </p>
                        {value.comparison && (
                            <p className="mt-1 font-medium text-slate-700">
                                共同有效：{value.comparison.counts.common_valid} 行 · 数值差异：
                                {value.comparison.counts.value_mismatches} 行 · 缺失差异：
                                {value.comparison.counts.missing_mismatches} 行
                            </p>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                        运行环境：Python {value.environment.runtime.python} · pandas {value.environment.runtime.pandas}
                        。完整映射、反例和 AI 解读可在因子详情的原始 Python 验证区查看；本次观察不代表收益或平台全局等价。
                    </p>
                </div>
            )}

            {/* 登记后的固定验证 */}
            {value.kind === 'fixed_validation' && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-800">{value.market.symbol}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                            {value.market.timeframe}
                        </span>
                        <QuantBadge tone={value.mode === 'fresh' ? 'emerald' : 'slate'}>
                            {value.mode === 'fresh' ? '新数据验证' : '普通复核'}
                        </QuantBadge>
                        <span className="text-slate-500">
                            费率：{value.config.fee_bps} bps / 滑点：{value.config.slippage_bps} bps
                        </span>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-700">测试区间：</span>
                            <span className="font-mono text-slate-600">
                                {value.bounds.start_timestamp} → {value.bounds.end_timestamp}
                            </span>
                            <span className="text-slate-400">（来源尝试 {value.source_attempt_id}）</span>
                        </div>
                        <div className="break-all font-mono text-[11px] text-slate-500">
                            参数：
                            {Object.entries(value.recipe.parameters)
                                .map(([k, v]) => `${k}=${v}`)
                                .join('，') || '无可调参数'}
                        </div>
                    </div>

                    {value.result_status && value.result_status !== 'completed' && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                            {value.result_status === 'cancelled' ? '评价已停止' : '评价未完成'}：{value.error}
                            ；以下范围为冻结计划，未形成实际指标。
                        </div>
                    )}

                    <div className="space-y-2">
                        <div>
                            <span className="mb-1 block font-semibold text-slate-700">固定方案指标：</span>
                            <MetricsView value={value.metrics} />
                        </div>
                        <div>
                            <span className="mb-1 block font-semibold text-slate-700">同成本基线：</span>
                            <MetricsView value={value.baseline} />
                        </div>
                    </div>

                    {value.registered_criteria && (
                        <RegisteredCriteriaResult
                            criteria={value.registered_criteria}
                            assessment={value.criteria_assessment}
                        />
                    )}

                    {value.publication_audit ? (
                        <p className="text-xs text-slate-500">
                            发布审计：发现 {value.publication_audit.conflict_count} 条重叠，扫描
                            {value.publication_audit.complete_scan ? '覆盖已记录范围' : '不完整'}
                            ；外部使用及全局独立性未知。
                        </p>
                    ) : (
                        <p className="text-xs text-slate-400">尚未形成发布时审计，不能将未知记作零重叠。</p>
                    )}

                    <div>
                        <QuantButton size="sm" onClick={() => openExperiment(value.source_request_id)}>
                            <ExternalLink size={13} className="text-slate-500" />
                            <span>打开来源实验与固定验证</span>
                        </QuantButton>
                    </div>
                </div>
            )}

            {/* 本机受控实验 */}
            {value.kind === 'experiment' && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-800">{value.market.symbol || '标的未知'}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                            {value.market.timeframe || '周期未知'}
                        </span>
                        <QuantBadge
                            tone={
                                value.result_status === 'completed'
                                    ? 'emerald'
                                    : value.result_status === 'rejected'
                                      ? 'red'
                                      : 'amber'
                            }
                        >
                            {status[value.result_status] || value.result_status}
                        </QuantBadge>
                        <span className="text-slate-500">
                            费用 {value.config.fee_bps} bps · 滑点 {value.config.slippage_bps} bps · 隔离{' '}
                            {value.config.gap} 根
                        </span>
                    </div>

                    {value.config.strategy && (
                        <StrategySummary
                            policy={readStrategy(value.config.strategy, value.config.threshold)}
                            threshold={value.config.threshold}
                        />
                    )}

                    {value.heldout.map(
                        (row, index) =>
                            row.metrics.execution && (
                                <StrategyLedger
                                    key={index}
                                    execution={readStrategyExecution(
                                        row.metrics.execution,
                                        row.metrics.entries || 0,
                                        false
                                    )}
                                    label={row.number ? `第${row.number}折留出` : '本批留出'}
                                />
                            )
                    )}

                    {value.error && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
                            {value.error}
                        </div>
                    )}

                    {!value.attempts.length && value.checkpoint_count > 0 && (
                        <p className="text-slate-500">
                            尚无正式输出；已保存 {value.checkpoint_count}{' '}
                            个尝试检查点，可在完整实验中查看。此记录不推定计算成功。
                        </p>
                    )}

                    {!!value.overlap_audit?.total && (
                        <div className="rounded-xl border border-orange-200 bg-orange-50/80 p-3 text-orange-800">
                            同文集、同标的与周期已有 {value.overlap_audit.total}{' '}
                            次实验请求区间重叠；当前留出观察不能据此当作新数据的独立验证。
                        </div>
                    )}

                    {/* 尝试列表折叠 */}
                    {value.attempts.length > 0 && (
                        <QuantCollapsible
                            title={`当前版本的 ${value.attempts.length} 次直接尝试`}
                            subtitle="保留所有失败及反例"
                            className="border-slate-200/70"
                        >
                            <div className="max-h-80 space-y-2 overflow-auto pr-1 scrollbar-hide">
                                {value.attempts.map(attempt => (
                                    <div
                                        key={attempt.id}
                                        className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 space-y-1.5"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono font-bold text-slate-800">{attempt.id}</span>
                                            <QuantBadge
                                                tone={
                                                    attempt.status === 'completed'
                                                        ? 'emerald'
                                                        : attempt.status === 'rejected'
                                                          ? 'red'
                                                          : 'slate'
                                                }
                                                className="px-1.5 py-0 text-[10px]"
                                            >
                                                {status[attempt.status] || attempt.status}
                                                {attempt.fold ? ` · 第 ${attempt.fold} 折` : ''}
                                            </QuantBadge>
                                        </div>
                                        <p className="text-[11px] text-slate-600">
                                            参数：
                                            {attempt.parameters
                                                .map(row => `${row.original_name}=${JSON.stringify(row.value)}`)
                                                .join('，') || '无参数'}
                                        </p>
                                        <p className="text-[11px] text-slate-600">
                                            输入：
                                            {attempt.bindings.map(row => `${row.name} → ${row.column}`).join('，') ||
                                                '未形成输入绑定'}
                                        </p>
                                        {attempt.reason && (
                                            <p className="text-[11px] text-rose-700">{attempt.reason}</p>
                                        )}
                                        {attempt.metrics.train && (
                                            <div className="pt-1">
                                                <span className="text-[11px] text-slate-400">训练指标：</span>
                                                <MetricsView value={attempt.metrics.train} />
                                            </div>
                                        )}
                                        {attempt.metrics.validation && (
                                            <div className="pt-1">
                                                <span className="text-[11px] text-slate-400">验证指标：</span>
                                                <MetricsView value={attempt.metrics.validation} />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </QuantCollapsible>
                    )}

                    {/* 留出观察 */}
                    {value.heldout.length > 0 && (
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-2">
                            <p className="font-semibold text-slate-700">入选留出观察记录：</p>
                            <div className="space-y-1.5">
                                {value.heldout.map((row, index) => (
                                    <div
                                        key={index}
                                        className="rounded-lg border border-slate-200/60 bg-white p-2.5 shadow-2xs"
                                    >
                                        <div className="mb-1 font-mono text-[11px] text-slate-500">
                                            {row.number ? `第 ${row.number} 折` : '本批留出'} · {row.attempt_id}
                                        </div>
                                        <MetricsView value={row.metrics} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <QuantButton size="sm" onClick={() => openExperiment(value.request_id)}>
                            <ExternalLink size={13} className="text-slate-500" />
                            <span>查看完整实验、数据与参数</span>
                        </QuantButton>
                    </div>
                </div>
            )}

            {/* 固定样本对照 */}
            {value.kind === 'comparison' && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-800">{value.market.symbol || '标的未知'}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                            {value.market.timeframe || '周期未知'}
                        </span>
                        <QuantBadge
                            tone={
                                value.verdict === 'pass' ? 'emerald' : value.verdict === 'fail' ? 'red' : 'amber'
                            }
                        >
                            {value.verdict === 'pass'
                                ? '当前样本口径通过'
                                : value.verdict === 'fail'
                                  ? '发现直接反例'
                                  : '证据不足或未完成'}
                        </QuantBadge>
                        <span className="text-slate-600">
                            共同有效：{value.counts.common_valid ?? '未知'} 行 · 数值差异：
                            {value.counts.value_mismatches ?? '未知'} 行
                        </span>
                    </div>

                    <p className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-slate-600">
                        绝对容差 {value.policy.absolute_tolerance}，相对容差 {value.policy.relative_tolerance}，共同预热{' '}
                        {value.policy.warmup_bars} 根。结论仅限本次参数、行情和对齐规则。
                    </p>

                    <div className="grid gap-2 sm:grid-cols-2">
                        {value.sides.map(side => (
                            <div
                                key={side.side}
                                className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 leading-relaxed"
                            >
                                <span className="font-bold text-slate-800">
                                    {side.side === 'left' ? '本版本（左侧）' : '本版本（右侧）'}
                                </span>
                                <p className="mt-1 font-mono text-[11px] text-slate-600">
                                    参数：
                                    {side.parameters.map(row => `${row.name}=${JSON.stringify(row.value)}`).join('，') ||
                                        '无参数'}
                                </p>
                                <p className="mt-1 font-mono text-[11px] text-slate-600">
                                    输入：{side.bindings.map(row => `${row.name} → ${row.column}`).join('，')}
                                </p>
                            </div>
                        ))}
                    </div>

                    {openComparison && (
                        <div>
                            <QuantButton size="sm" onClick={() => openComparison(value.target_id)}>
                                <ExternalLink size={13} className="text-slate-500" />
                                <span>查看直接对照</span>
                            </QuantButton>
                        </div>
                    )}
                </div>
            )}

            {/* 用户观察反馈 */}
            {value.kind === 'feedback' && (
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">{value.title}</span>
                        <QuantBadge tone="slate">
                            {feedbackModes[value.mode as keyof typeof feedbackModes] || '未说明观察类型'}
                        </QuantBadge>
                        <span className="text-slate-500 font-mono text-[11px]">平台：{value.platform || '未说明'}</span>
                    </div>
                    <p className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 leading-relaxed">
                        {value.structured
                            ? `已结构化读取；上传记录算术核对：${
                                  {
                                      reconciled: '在已给口径内一致',
                                      mismatch: '存在差异',
                                      insufficient: '资料不足',
                                  }[value.accounting_status] || value.accounting_status
                              }。`
                            : '原始文本或配置记录，尚未形成可复现执行证据。'}
                        平台来源及实盘真实性尚未验证，用户声明不能替代程序验证。
                    </p>
                    <p className="text-[11px] text-slate-400">可在该研究的“使用反馈”查看原件与 AI 分析。</p>
                </div>
            )}

            {/* 证据版本与指纹折叠 */}
            <QuantCollapsible
                title="对象版本与证据指纹"
                icon={Fingerprint}
                className="border-slate-200/50 bg-slate-50/30"
                contentClassName="p-3"
            >
                <div className="grid gap-1 font-mono text-[11px] text-slate-400">
                    <p className="break-all">对象 ID：{value.target_id}</p>
                    <p className="break-all">公式指纹：{value.candidate_hash}</p>
                    <p className="break-all">记录指纹：{value.target_hash}</p>
                    <p className="break-all">生效范围：{value.scope}</p>
                </div>
            </QuantCollapsible>
        </article>
    );
}
