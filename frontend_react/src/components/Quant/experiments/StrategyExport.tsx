import {useEffect, useState} from 'react';
import {quantApi} from '../../../api/quant';
import type {QuantStrategyArtifact, QuantStrategyExport} from '../../../types/api/quantStrategyExport';
import {readStrategyExport} from '../../../utils/quantStrategyExport';
import {downloadQuantBlob} from '../../../utils/quant';
import {QuantModal, QuantButton} from '../ui';
import {CodeEditor} from '../CodeEditor';
export function StrategyExport({collection, experimentId, attemptId, close, openEntry}: {collection: string; experimentId: string; attemptId: string; close: () => void; openEntry: (id: string) => void}) {
    const [response, setResponse] = useState<{key: string; data?: QuantStrategyExport; error?: string}>();
    const [retry, setRetry] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [archived, setArchived] = useState<QuantStrategyArtifact>();
    const key = JSON.stringify([collection, experimentId, attemptId, retry]);
    useEffect(() => {
        const controller = new AbortController();
        void quantApi.exportStrategy(collection, experimentId, attemptId, controller.signal).then(data => {if (!controller.signal.aborted) setResponse({key, data});}).catch((cause: unknown) => {if (!controller.signal.aborted) setResponse({key, error: cause instanceof Error ? cause.message : '策略候选生成失败'});});
        return () => controller.abort();
    }, [collection, experimentId, attemptId, key]);
    const data = response?.key === key ? response.data : undefined;
    let manifest: ReturnType<typeof readStrategyExport> | undefined, decodeError = '';
    try {if (data) manifest = readStrategyExport(data.manifestJson);} catch (cause) {decodeError = cause instanceof Error ? cause.message : '平台清单无法读取';}
    const current = archived || data?.artifacts.find(row => row.id === manifest?.artifact_id);
    const archive = async () => {
        if (busy || !manifest) return;
        setBusy(true); setError('');
        try {setArchived(await quantApi.archiveStrategy(collection, experimentId, attemptId));} catch (cause) {setError(cause instanceof Error ? cause.message : '归档失败，候选代码仍可下载');} finally {setBusy(false);}
    };
    const actions = manifest && data ? <div className="flex flex-wrap justify-end gap-3"><QuantButton onClick={() => downloadQuantBlob(new Blob([data.manifestJson], {type: 'application/json'}), `${data.filename}.manifest.json`)}>下载配置与来源</QuantButton><QuantButton onClick={() => downloadQuantBlob(new Blob([data.code], {type: 'text/plain;charset=utf-8'}), data.filename)}>下载 EA 候选源码</QuantButton>{current ? <QuantButton primary onClick={() => {close(); openEntry(current.entryId);}}>打开归档研究</QuantButton> : <QuantButton primary disabled={busy} onClick={() => void archive()}>{busy ? '正在归档…' : '归档为候选代码版本'}</QuantButton>}</div> : undefined;
    return <QuantModal title={`MQ4 EA 候选 · ${attemptId}`} close={close} busy={busy} wide footer={actions}><div className="space-y-4">
        <p className="text-sm leading-7 text-slate-600">根据这次实际公式、参数和冻结策略规则生成，允许在 MT4 策略测试器做单次测试。下载与归档只保存源码；原生编译、运行及等价性仍待验证。</p>
        {(response?.key === key && response.error || decodeError) ? <div role="alert" className="text-sm text-red-600">{response?.error || decodeError}<QuantButton onClick={() => setRetry(n => n + 1)}>重试生成</QuantButton></div> : !manifest || !data ? <p role="status" className="text-sm text-slate-500">正在生成策略候选…</p> : <>
            {manifest.local_demo && <p role="status" className="rounded-xl bg-orange-50 p-4 text-sm leading-7 text-orange-800">人工本地样例：未转换公式、编译或运行代码。下载源码明确为不执行的样例；真实EA候选需要由后端生成。</p>}
            <section className="rounded-xl border border-slate-200 p-4 text-xs leading-7 text-slate-600"><p className="font-semibold">实际导出：{manifest.context.attempt_id}{manifest.context.fold ? ` · 第${manifest.context.fold}折` : ''}</p><p>公式参数：{Object.entries(manifest.context.recipe.parameters).map(([name, value]) => `${name}${manifest.parameter_mapping[name] && manifest.parameter_mapping[name] !== name ? `（${manifest.parameter_mapping[name]}）` : ''}=${JSON.stringify(value)}`).join('，') || '无参数'}</p><p>MT4目标：{String(manifest.native_inputs.QExpectedSymbol)} · {String(manifest.native_inputs.QExpectedPeriod)}分钟；默认最大偏离 {String(manifest.native_inputs.QMaxDeviationPoints)}点。未知周期为0，需在测试器明确映射。</p></section>
            <details open className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-xs leading-7"><summary className="cursor-pointer font-semibold">本机与 MT4 的执行差异</summary><ul className="mt-2 list-disc space-y-2 pl-4 text-slate-600">{manifest.limitations.map(line => <li key={line}>{line}</li>)}</ul></details>
            <CodeEditor value={data.code} language="mql4" readOnly compact/>
            <details className="text-xs"><summary className="cursor-pointer font-semibold text-slate-600">平台验证清单与来源指纹</summary><ul className="my-3 list-disc space-y-1 pl-4 text-slate-500">{manifest.required_validation.map(line => <li key={line}>{line}</li>)}</ul><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3 leading-6 scrollbar-hide">{data.manifestJson}</pre></details>
            <p className="text-xs leading-6 text-slate-500">原生测试输出：{manifest.native_output}。保留原始测试报告与日志，将 JSON 作为“使用反馈”的标准执行证据导入；时区、tick模型、未平仓与额外费用继续核对。</p>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {current && <p role="status" className="break-all text-xs leading-6 text-slate-600">已归档到来源研究的代码实现 · 版本 {current.versionId.slice(0, 8)}。原始公式、策略配置与源码分别保留，未标记编译或运行通过。</p>}

        </>}
    </div></QuantModal>;
}
