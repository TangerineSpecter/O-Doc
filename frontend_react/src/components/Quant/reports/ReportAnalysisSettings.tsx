import { Activity, Sparkles } from 'lucide-react';
import { Select } from '../../common/Select';
import { quantApi } from '../../../api/quant';
import { quantDate } from '../../../utils/quant';
import type { QuantController } from '../../../hooks/useQuant';
import type { QuantAIRun, QuantReport, QuantSource } from '../../../types/api/quant';
import { QuantButton } from '../ui';
import { SourcePreview } from '../SourcePreview';

export function ReportAnalysisSettings({ source, sources, report, lastRun, active, otherActive, controller,
    collection, entryId, modelId, onModelChange, setSourceId, start, code, request, openSupplement,
    analyzeDisabledReason, supplementNotice }: {
    source?: QuantSource; sources: QuantSource[]; report?: QuantReport; lastRun?: QuantAIRun; active?: QuantAIRun;
    otherActive: QuantAIRun[]; controller: QuantController; collection: string; entryId: string; modelId: string;
    onModelChange: (id: string) => void; setSourceId: (id: string) => void; start: () => void; code: () => void;
    request: (action: () => void) => void; openSupplement: (source: QuantSource) => void;
    analyzeDisabledReason: string; supplementNotice: string;
}) {
    return (
        <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold text-slate-900">AI 研究报告与来源配置</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                        整理原理、参数与评分，提取可复用因子，并提出首轮实验方案。
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <QuantButton
                        size="sm"
                        disabled={
                            !source?.payload.code ||
                            source.id !== source.materialCurrentSourceId ||
                            controller.busy
                        }
                        onClick={() => request(() => { if (source) openSupplement(source); })}
                    >
                        补充依赖源码
                    </QuantButton>
                    <QuantButton size="sm" primary disabled={!!analyzeDisabledReason} onClick={start}>
                        <Sparkles size={13} />
                        {active
                            ? '分析中…'
                            : report?.schemaVersion === 4 || report?.schemaVersion === 5
                              ? '分析来源资料'
                              : report
                                ? '重新分析'
                                : '生成研究报告'}
                    </QuantButton>
                </div>
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 sm:grid-cols-2">
                <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-700">
                    <span className="block">分析来源</span>
                    <Select
                        menuPortal
                        value={source?.id || ''}
                        onChange={setSourceId}
                        options={sources.map((row, i) => ({
                            value: row.id,
                            label: `${
                                row.payload.fetchStatus === 'fetched'
                                    ? '网页快照'
                                    : row.payload.fetchStatus === 'failed'
                                      ? '获取失败快照'
                                      : row.payload.provenance === 'code_version'
                                        ? '代码快照'
                                        : '提交资料'
                            } · ${row.payload.title || row.payload.language || '文字'} · ${quantDate(row.createdAt)} · ${i + 1}${
                                row.materialCurrentSourceId === row.id ? ' · 材料当前快照' : ''
                            }`,
                        }))}
                        emptyMessage="尚无来源材料"
                    />
                </label>
                <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-700">
                    <span className="block">分析模型</span>
                    <Select
                        menuPortal
                        value={modelId}
                        onChange={onModelChange}
                        options={controller.models.models.map((row) => ({
                            value: row.id,
                            label: row.name,
                        }))}
                        emptyMessage="请先配置对话模型"
                    />
                </label>
            </div>
            {lastRun && ['failed', 'interrupted', 'cancelled'].includes(lastRun.status) && (
                <p className="mt-2 text-xs text-slate-500">继续未完成阶段时沿用原任务的模型；上方选择用于新分析。</p>
            )}

            {!source && (
                <div className="mt-3">
                    <QuantButton size="sm" onClick={code}>添加或保存代码版本</QuantButton>
                </div>
            )}
            {!controller.models.models.length && (
                <p className="mt-2.5 text-xs text-slate-500">
                    资料已归档。配置对话模型后即可开始分析。
                </p>
            )}
            {active && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-xs text-orange-800">
                    <span role="status" className="flex items-center gap-2">
                        <Activity size={14} className="animate-pulse text-orange-500" />
                        {active.preview || '正在分析材料，可以离开页面，稍后回来查看。'}
                    </span>
                    <QuantButton
                        size="sm"
                        onClick={() =>
                            void controller.safe(() => quantApi.cancel(collection, entryId, active.id))
                        }
                    >
                        取消分析
                    </QuantButton>
                </div>
            )}
            {otherActive.map((run) => (
                <div
                    key={run.id}
                    role="status"
                    className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600"
                >
                    <p className="min-w-0 flex-1">
                        本条目有{run.kind === 'analyze' ? '其他来源的分析' : '其他研究'}
                        任务正在执行，结束后可启动新的完整分析。
                        <span className="block break-words text-[11px] text-slate-500">
                            来源：
                            {sources.find((row) => row.id === (run.resolvedSourceId || run.sourceId))
                                ?.payload.title ||
                                run.sourceId ||
                                '未指定'}{' '}
                            · {run.preview || (run.status === 'pending' ? '等待执行' : '执行中')}
                        </span>
                    </p>
                    <QuantButton
                        size="sm"
                        disabled={controller.busy}
                        onClick={() =>
                            void controller.safe(() => quantApi.cancel(collection, entryId, run.id))
                        }
                    >
                        取消该任务
                    </QuantButton>
                </div>
            ))}
            {lastRun && ['failed', 'interrupted', 'cancelled'].includes(lastRun.status) && (
                <p
                    role="status"
                    className="mt-3 rounded-xl border border-orange-200 bg-orange-50/70 px-3.5 py-2.5 text-xs text-orange-800"
                >
                    {lastRun.error || '上次分析已停止'}。已完成的阶段记录会保留。
                </p>
            )}
            {supplementNotice && (
                <p role="status" className="mt-2.5 text-xs leading-6 text-slate-600">
                    {supplementNotice}
                </p>
            )}
            {source && <SourcePreview source={source} />}
        </section>
    );
}
