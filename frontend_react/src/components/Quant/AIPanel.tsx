import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Clock3, Loader2, RefreshCw, Sparkles, Square } from 'lucide-react';
import { quantApi } from '../../api/quant';
import { createRequestKey } from '../../utils/requestKey';
import { quantDate, quantError } from '../../utils/quant';
import { Select } from '../common/Select';
import { QuantButton, QuantModal, QuantField, cardClass } from './ui';
import { CodeEditor } from './CodeEditor';
import { quantLanguageOptions as languageOptions } from '../../utils/quant';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantAIRun, QuantCodeVersion, QuantEntryDetail, QuantLanguage } from '../../types/api/quant';

export interface QuantAIRequest {
    version: QuantCodeVersion;
    kind: 'explain' | 'convert';
}
const statusLabels = {
    pending: '等待执行',
    running: '生成中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    interrupted: '已中断',
};
export function AIStartModal({
    request,
    collection,
    entry,
    controller,
    close,
    started,
}: {
    request: QuantAIRequest;
    collection: string;
    entry: QuantEntryDetail;
    controller: QuantController;
    close: () => void;
    started: (run: QuantAIRun) => void;
}) {
    const [language, setLanguage] = useState<QuantLanguage>(request.version.language === 'python' ? 'pine' : 'python');
    const [targetVersion, setTargetVersion] = useState('');
    const [requirements, setRequirements] = useState('');
    const [model, setModel] = useState(controller.models.defaultModelId);
    const [requestKey] = useState(createRequestKey);
    const start = async () => {
        let result: QuantAIRun | null = null;
        const ok = await controller.safe(async () => {
            result = await quantApi.run(collection, entry.id, {
                kind: request.kind,
                sourceVersionId: request.version.id,
                ...(request.kind === 'convert' ? { targetLanguage: language, targetVersion } : {}),
                requirements,
                modelId: model,
                requestKey,
            });
        });
        if (ok && result) started(result);
    };
    return (
        <QuantModal
            title={request.kind === 'convert' ? '转换代码语言' : '解释代码'}
            close={close}
            busy={controller.busy}
        >
            <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4 text-xs leading-6 text-orange-800">
                <p>
                    来源版本：<span className="font-mono">{request.version.id.slice(0, 8)}</span> ·{' '}
                    {languageOptions.find((option) => option.value === request.version.language)?.label}{' '}
                    {request.version.languageVersion}
                </p>
                <p>仅发送选定版本的代码、依赖、参数及本次补充要求，不自动读取研究说明或附件。</p>
            </div>
            {request.kind === 'convert' && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold text-slate-700">
                        <span className="block">目标语言</span>
                        <Select menuPortal value={language} options={languageOptions} onChange={setLanguage} />
                    </label>
                    <QuantField
                        label="目标语言 / 平台版本"
                        value={targetVersion}
                        onChange={setTargetVersion}
                        placeholder="例如 Pine v6 / Python 3.11"
                    />
                </div>
            )}
            <label className="block space-y-2 text-sm font-semibold text-slate-700">
                <span className="block">对话模型</span>
                <Select
                    menuPortal
                    value={model}
                    options={controller.models.models.map((item) => ({
                        value: item.id,
                        label: item.name,
                        description: item.id === controller.models.defaultModelId ? '系统默认对话模型' : undefined,
                    }))}
                    onChange={setModel}
                    emptyMessage="请先在系统设置中配置对话模型"
                />
            </label>
            <QuantField
                label="补充要求"
                value={requirements}
                onChange={setRequirements}
                multiline
                placeholder={
                    request.kind === 'convert'
                        ? '例如：保留信号计算逻辑；说明回测平台差异和无法直接映射的函数'
                        : '例如：重点解释输入数据、窗口边界和信号产生的条件'
                }
            />
            <p className="text-xs leading-6 text-slate-500">
                转换结果先保存为候选。你明确采用后才会新增实现，并保持“待验证”状态。
            </p>
            {controller.models.models.length === 0 && (
                <p role="status" className="rounded-xl bg-orange-50 p-3 text-sm text-orange-700">
                    尚未配置对话模型。请先在系统设置中添加提供商和对话模型，再回来提交任务。
                </p>
            )}
            <div className="flex justify-end gap-3">
                <QuantButton onClick={close} disabled={controller.busy}>
                    取消
                </QuantButton>
                <QuantButton primary disabled={controller.busy || !model} onClick={() => void start()}>
                    <Sparkles size={15} />
                    {controller.busy ? '提交中…' : '开始任务'}
                </QuantButton>
            </div>
            {controller.error && (
                <p role="alert" className="text-sm text-red-600">
                    {controller.error}
                </p>
            )}
        </QuantModal>
    );
}

export function AIHistory({
    collection,
    entry,
    controller,
    selectedId,
    select,
    appendExplanation,
    request,
}: {
    request: (proceed: () => void) => void;
    collection: string;
    entry: QuantEntryDetail;
    controller: QuantController;
    selectedId: string;
    select: (id: string) => void;
    appendExplanation: (text: string) => void;
}) {
    const codeRuns = entry.runs.filter(item => ['explain', 'convert'].includes(item.kind));
    const run = codeRuns.find((item) => item.id === selectedId);
    return (
        <section className={cardClass}>
            <div className="mb-4 flex items-center gap-2">
                <Sparkles size={17} className="text-orange-500" />
                <h3 className="text-sm font-bold text-slate-800">AI 研究记录</h3>
                <span className="ml-auto text-xs text-slate-400">{codeRuns.length} 次任务</span>
            </div>
            {codeRuns.length ? (
                <div className="space-y-2">
                    {codeRuns.map((item) => (
                        <button
                            type="button"
                            key={item.id}
                            onClick={() => request(() => select(item.id))}
                            className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-orange-200 hover:bg-orange-50/30"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                                {item.status === 'running' || item.status === 'pending' ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : item.status === 'completed' ? (
                                    <Check size={16} />
                                ) : (
                                    <AlertCircle size={16} />
                                )}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-700">
                                    {item.kind === 'convert'
                                        ? `转换为 ${languageOptions.find((option) => option.value === item.targetLanguage)?.label || item.targetLanguage}`
                                        : '解释代码'}
                                    <span className="ml-2 text-xs font-normal text-slate-400">
                                        {statusLabels[item.status]}
                                    </span>
                                </p>
                                <p className="mt-1 truncate text-[11px] text-slate-400">
                                    {item.modelName || '默认模型'} · {quantDate(item.createdAt)} ·{' '}
                                    {(item.sourceVersionId || item.sourceId || '').slice(0, 8)}
                                </p>
                            </div>
                            <ArrowRight size={15} className="shrink-0 text-slate-300" />
                        </button>
                    ))}
                </div>
            ) : (
                <p className="py-4 text-sm leading-6 text-slate-400">
                    从代码实现中选择一个版本，即可解释逻辑或生成其他语言的候选实现。
                </p>
            )}
            {run && (
                <AIRunModal
                    key={run.id}
                    initial={run}
                    collection={collection}
                    entry={entry}
                    controller={controller}
                    close={() => select('')}
                    select={select}
                    appendExplanation={appendExplanation}
                />
            )}
        </section>
    );
}

function AIRunModal({
    initial,
    collection,
    entry,
    controller,
    close,
    select,
    appendExplanation,
}: {
    initial: QuantAIRun;
    collection: string;
    entry: QuantEntryDetail;
    controller: QuantController;
    close: () => void;
    select: (id: string) => void;
    appendExplanation: (text: string) => void;
}) {
    const [run, setRun] = useState(initial);
    const [pollError, setPollError] = useState('');
    const [pollRetry, setPollRetry] = useState(0);
    const [adopted, setAdopted] = useState(false);
    const running = run.status === 'pending' || run.status === 'running';
    useEffect(() => {
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const result = await quantApi.poll(collection, entry.id, initial.id, abort.signal);
                if (abort.signal.aborted) return;
                setRun(result);
                setPollError('');
                if (result.status === 'pending' || result.status === 'running')
                    timer = setTimeout(() => void poll(), 1500);
                else void controller.refresh().catch(() => undefined);
            } catch (error) {
                if (!abort.signal.aborted) setPollError(quantError(error));
            }
        };
        void poll();
        return () => {
            abort.abort();
            clearTimeout(timer);
        };
        // A task owns its polling lifetime; controller refresh identity changes with render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collection, entry.id, initial.id, pollRetry]);
    const cancel = async () => {
        await controller.safe(async () => {
            setRun(await quantApi.cancel(collection, entry.id, run.id));
        });
    };
    const retry = async () => {
        let next: QuantAIRun | null = null;
        const ok = await controller.safe(async () => {
            next = await quantApi.run(collection, entry.id, {
                kind: run.kind,
                sourceVersionId: run.sourceVersionId,
                ...(run.kind === 'convert' && run.targetLanguage
                    ? { targetLanguage: run.targetLanguage, targetVersion: run.targetVersion }
                    : {}),
                requirements: run.requirements,
                modelId: run.modelId,
                requestKey: createRequestKey(),
            });
        });
        if (ok && next) select((next as QuantAIRun).id);
    };
    const adopt = async () => {
        const ok = await controller.safe(async () => {
            const result = await quantApi.adopt(collection, entry.id, run.id);
            if (run.kind === 'explain' && result.explanation) appendExplanation(result.explanation);
            if (result.implementation)
                setRun((current) => ({ ...current, adoptedImplementationId: result.implementation!.id }));
        });
        if (ok) {
            setAdopted(true);
            if (run.kind === 'explain') close();
        }
    };
    return (
        <QuantModal
            title={run.kind === 'convert' ? '语言转换候选' : '代码解释结果'}
            close={close}
            wide
            busy={controller.busy}
        >
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                    className={`rounded-full px-2.5 py-1 ${run.status === 'completed' ? 'bg-lime-50 text-lime-700' : running ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500'}`}
                >
                    {running && <Loader2 className="mr-1 inline animate-spin" size={12} />} {statusLabels[run.status]}
                </span>
                <span className="text-slate-400">
                    {run.modelName} · 来源 {(run.sourceVersionId || run.sourceId || '').slice(0, 8)}
                </span>
                <span className="ml-auto text-slate-400">
                    <Clock3 size={12} className="mr-1 inline" />
                    {quantDate(run.createdAt)}
                </span>
            </div>
            {running && (
                <div className="rounded-xl bg-orange-50/50 p-4 text-sm leading-6 text-orange-700">
                    任务在后台执行，可以关闭弹窗，稍后在研究记录中查看。
                    <p className="mt-2 text-xs">{run.preview || '正在等待模型输出…'}</p>
                </div>
            )}
            {run.error && (
                <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-600">
                    {run.error}
                </p>
            )}
            {pollError && (
                <p role="alert" className="text-sm text-red-600">
                    状态加载失败：{pollError}
                    <QuantButton onClick={() => setPollRetry((value) => value + 1)}>刷新状态</QuantButton>
                </p>
            )}
            {run.status === 'completed' && (
                <>
                    {run.result.code && (
                        <CodeEditor value={run.result.code} language={run.targetLanguage || 'python'} readOnly />
                    )}
                    {(
                        [
                            { key: 'explanation', label: '代码解释' },
                            { key: 'differences', label: '实现差异' },
                            { key: 'assumptions', label: '转换假设' },
                            { key: 'dependencies', label: '所需依赖' },
                            { key: 'limitations', label: '限制与未覆盖功能' },
                        ] as const
                    ).map(
                        (field) =>
                            run.result[field.key] && (
                                <section key={field.key}>
                                    <h3 className="mb-2 text-sm font-semibold text-slate-800">{field.label}</h3>
                                    <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                                        {run.result[field.key]}
                                    </p>
                                </section>
                            ),
                    )}
                    <p className="rounded-lg border border-orange-100 bg-orange-50 p-3 text-xs leading-6 text-orange-700">
                        采用后仍需在外部平台分别完成编译、运行和结果核对。候选代码尚未被证明与来源实现等价。
                    </p>
                </>
            )}
            <div className="flex flex-wrap justify-end gap-3">
                {running ? (
                    <QuantButton danger disabled={controller.busy} onClick={() => void cancel()}>
                        <Square size={14} />
                        取消任务
                    </QuantButton>
                ) : (
                    run.status !== 'completed' && (
                        <QuantButton disabled={controller.busy} onClick={() => void retry()}>
                            <RefreshCw size={14} />
                            重新提交任务
                        </QuantButton>
                    )
                )}
                {run.status === 'completed' && (
                    <QuantButton
                        primary
                        disabled={
                            controller.busy ||
                            adopted ||
                            !!run.adoptedImplementationId ||
                            (run.kind === 'convert' && !run.result.code)
                        }
                        onClick={() => void adopt()}
                    >
                        <Check size={15} />
                        {run.adoptedImplementationId || adopted
                            ? '已采用'
                            : run.kind === 'convert'
                              ? '采用为新实现'
                              : '追加到研究说明草稿'}
                    </QuantButton>
                )}
                <QuantButton onClick={close} disabled={controller.busy}>
                    关闭
                </QuantButton>
            </div>
            {controller.error && (
                <p role="alert" className="text-sm text-red-600">
                    {controller.error}
                </p>
            )}
        </QuantModal>
    );
}
