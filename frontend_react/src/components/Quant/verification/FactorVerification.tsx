import {useMemo} from 'react';
import {
    ShieldCheck,
    Loader2,
    RefreshCw,
    Sparkles,
    AlertCircle,
    FileSearch,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
} from 'lucide-react';
import type {QuantFactorData} from '../../../types/api/quant';
import {FactorReadiness} from './FactorReadiness';
import {FactorQualification} from './FactorQualification';
import {useQuantVerification} from '../../../hooks/useQuantVerification';
import {readQualification, readVerification, reuseLabels, verificationLevelLabels} from '../../../utils/quantVerification';
import {QuantBadge, QuantButton} from '../ui';
import {VerificationEvidence} from './VerificationEvidence';
import {QuantCollapsible} from './QuantCollapsible';

export function FactorVerification({
    collection,
    candidate,
    openExperiment,
    openComparison,
    openVersions,
    definition,
    openSource,
}: {
    definition?: QuantFactorData;
    openSource?: () => void;
    collection: string;
    candidate: string;
    openExperiment: (id: string) => void;
    openComparison?: (id: string) => void;
    openVersions?: () => void;
}) {
    const state = useQuantVerification(collection, candidate);
    const decoded = useMemo(() => {
        const value = state.data;
        try {
            return value
                ? {
                      qualification: value.qualificationJson ? readQualification(value.qualificationJson) : null,
                      items: value.items.map(row => ({...row, parsed: readVerification(row.dataJson)})),
                      error: '',
                  }
                : null;
        } catch (error) {
            return {
                qualification: null,
                items: [],
                error: error instanceof Error ? error.message : '验证记录格式不完整',
            };
        }
    }, [state.data]);

    const value = state.data;
    const qualification = decoded?.qualification;

    const content = value && decoded && (
        <div className="space-y-5">
            {/* AI 独立修订提示 */}
            {!!value.aiRevisions?.length && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4 text-xs leading-6 text-slate-700">
                    <div className="flex items-center gap-2 font-bold text-orange-900">
                        <Sparkles size={16} className="text-orange-600" />
                        <span>AI 已为此原始候选生成独立修订，原版继续保留</span>
                    </div>
                    <div className="mt-2 space-y-1">
                        {value.aiRevisions.map(row => (
                            <p key={row.candidateId} className="text-slate-600">
                                <strong className="font-semibold text-slate-800">{row.name}</strong> · {row.summary}
                            </p>
                        ))}
                    </div>
                    {openVersions && (
                        <div className="mt-3">
                            <QuantButton size="sm" onClick={openVersions} primary>
                                查看 AI 修订与原版
                            </QuantButton>
                        </div>
                    )}
                </div>
            )}

            {value.aiRevision && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4 text-xs leading-6 text-slate-700 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-orange-900">
                        <Sparkles size={16} className="text-orange-600" />
                        <span>{value.aiRevision.summary}</span>
                    </div>
                    <p className="text-slate-600">
                        变更字段：<span className="font-semibold text-slate-800">{value.aiRevision.changedFields.join('、')}</span>。结构通过不证明平台等价或盈利。
                    </p>
                    {value.aiRevision.remainingUnknowns.map((text, i) => (
                        <p key={i} className="text-amber-800">
                            仍待核对：{text}
                        </p>
                    ))}
                    {value.aiRevision.evidence.map((row, i) => (
                        <blockquote
                            key={i}
                            className="whitespace-pre-wrap break-words rounded-lg border-l-3 border-orange-400 bg-white/60 p-2.5 text-slate-600"
                        >
                            {row.quote}
                        </blockquote>
                    ))}
                </div>
            )}

            {/* 就绪度与技术核验 */}
            {qualification ? (
                <div className="space-y-4">
                    <FactorReadiness
                        value={qualification}
                        definition={definition}
                        openSource={openSource}
                        openVersions={openVersions}
                    />

                    {/* 完整结构检查折叠 */}
                    <QuantCollapsible
                        title={`完整结构检查 · ${reuseLabels[value.reuseStatus]}`}
                        badge={
                            <QuantBadge
                                tone={value.reuseStatus === 'reusable' ? 'emerald' : 'amber'}
                                className="px-2 py-0.5 text-[11px]"
                            >
                                {value.reuseStatus === 'reusable' ? '受控表达式结构可复用' : '结构检查待完善'}
                            </QuantBadge>
                        }
                        icon={ClipboardCheck}
                        defaultOpen={false}
                        className="border-slate-200/90"
                    >
                        <FactorQualification value={qualification} />
                    </QuantCollapsible>
                </div>
            ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
                    <AlertCircle size={16} className="shrink-0 text-slate-400" />
                    <span>旧记录尚未归集此项结构检查，可使用下方按钮补齐；不会启动模型或真实行情计算。</span>
                </div>
            )}

            {/* 直接证据记录 */}
            <div className="space-y-4 border-t border-slate-100 pt-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h5 className="text-sm font-bold text-slate-900">当前版本的直接证据</h5>
                        <p className="mt-0.5 text-xs text-slate-500">
                            原平台等价性尚未验证，经济有效性仍需按具体实验判断。留出观察的既往使用情况未核实，模拟/实盘用户报告单独标注。
                        </p>
                    </div>
                </div>

                {/* 证据层级徽章流 */}
                {value.levels.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {value.levels.map(level => (
                            <QuantBadge key={level} tone="slate" className="px-2 py-0.5 text-xs">
                                {verificationLevelLabels[level] || '其他证据记录'}
                            </QuantBadge>
                        ))}
                    </div>
                )}

                {/* 证据记录卡片列表 / 空状态 */}
                {value.items.length ? (
                    <div className="space-y-3">
                        {decoded.items.map(row => (
                            <VerificationEvidence
                                key={row.id}
                                value={row.parsed}
                                createdAt={row.createdAt}
                                openExperiment={openExperiment}
                                openComparison={openComparison}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                        <FileSearch size={28} className="text-slate-300" />
                        <p className="mt-2 text-xs font-semibold text-slate-600">暂无已归集的直接验证记录</p>
                        <p className="mt-1 text-xs text-slate-400 max-w-sm">
                            已有历史实验、对照或反馈可继续归集。此操作只扫描关联索引，不启动实际计算或模型调用。
                        </p>
                    </div>
                )}

                {/* 分页组件 */}
                {value.total > 20 && (
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <span>
                            展示 {state.offset + 1}–{state.offset + value.items.length} 条，共 {value.total} 条记录
                        </span>
                        <div className="flex items-center gap-2">
                            <QuantButton
                                size="sm"
                                disabled={state.offset === 0}
                                onClick={() => state.setOffset(Math.max(0, state.offset - 20))}
                            >
                                <ChevronLeft size={13} />
                                <span>上一页</span>
                            </QuantButton>
                            <QuantButton
                                size="sm"
                                disabled={state.offset + value.items.length >= value.total}
                                onClick={() => state.setOffset(state.offset + 20)}
                            >
                                <span>下一页</span>
                                <ChevronRight size={13} />
                            </QuantButton>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div
            className="space-y-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-shadow duration-200 sm:p-6"
            aria-label="结构检查与验证证据"
        >
            {/* 顶部标题区 */}
            <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-orange-500" />
                    <h4 className="text-base font-bold text-slate-900">计算条件与验证证据</h4>
                </div>
                <p className="mt-1.5 text-xs leading-6 text-slate-500">
                    先补齐定义和输入，再评价实际计算。证据仅属于当前版本与当时配置，保留失败和反例。
                </p>
            </div>

            {/* 加载中状态 */}
            {state.loading ? (
                <div role="status" className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
                    <Loader2 size={16} className="animate-spin text-orange-500" />
                    <span>正在读取结构检查与验证依据…</span>
                </div>
            ) : state.error || decoded?.error ? (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-2.5 text-xs text-rose-700">
                    <div className="flex items-center gap-2 font-semibold">
                        <AlertCircle size={16} />
                        <span>读取失败</span>
                    </div>
                    <p>{state.error || decoded?.error}</p>
                    <QuantButton size="sm" onClick={state.reload}>
                        <RefreshCw size={12} className="text-slate-500" />
                        <span>重试</span>
                    </QuantButton>
                </div>
            ) : (
                content
            )}

            {/* 底部归集操作与进度条 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center gap-2.5">
                    <QuantButton
                        size="sm"
                        disabled={state.indexing.busy}
                        onClick={() => void state.index()}
                    >
                        {state.indexing.busy ? (
                            <Loader2 size={13} className="animate-spin text-orange-500" />
                        ) : (
                            <RefreshCw size={13} className="text-slate-500" />
                        )}
                        <span>归集已有证据与结构检查</span>
                    </QuantButton>

                    {state.indexing.busy && (
                        <QuantButton size="sm" danger onClick={state.stop}>
                            停止归集
                        </QuantButton>
                    )}

                    {state.indexing.progress && (
                        <span role="status" className="text-xs text-slate-500">
                            {state.indexing.progress}
                        </span>
                    )}
                </div>
            </div>

            {state.indexing.error && (
                <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-600">
                    {state.indexing.error}
                </p>
            )}
        </div>
    );
}
