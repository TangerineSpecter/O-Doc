import {useEffect, useState} from 'react';
import {quantApi} from '../../api/quant';
import type {QuantFactorCandidate} from '../../types/api/quant';
import {quantExportTargets, type QuantExportBundle, type QuantExportTarget} from '../../types/api/quantExport';
import {downloadQuantBlob} from '../../utils/quant';
import {containsAlgorithmProgram} from '../../utils/quantAlgorithm';
import {Select} from '../common/Select';
import {CodeEditor} from './CodeEditor';
import {QuantButton, QuantModal} from './ui';

export function FactorExport({collection, candidate, close}: {collection: string; candidate: QuantFactorCandidate; close: () => void}) {
    const [target, setTarget] = useState<QuantExportTarget>('python');
    const [result, setResult] = useState<{key: string; bundle?: QuantExportBundle; error?: string} | null>(null);
    const [attempt, setAttempt] = useState(0);
    const key = JSON.stringify([collection, candidate.id, target, attempt]);
    const bundle = result?.key === key ? result.bundle : null;
    const error = result?.key === key ? result.error : '';
    useEffect(() => {
        const controller = new AbortController();
        void quantApi.exportFactor(collection, candidate.id, target, controller.signal).then(value => {if (!controller.signal.aborted) setResult({key, bundle: value});})
            .catch((reason: unknown) => {if (!controller.signal.aborted) setResult({key, error: reason instanceof Error ? reason.message : '导出失败，请重试'});});
        return () => controller.abort();
    }, [collection, candidate.id, target, key]);
    return <QuantModal title="导出候选指标" close={close} wide>
        <div className="space-y-4">
            <p className="text-sm leading-7 text-slate-600">{candidate.curation.name} · 由已归档的表达式生成，保留来源、参数映射与计算口径。只输出指标计算，平台编译与等价性待验证。</p>
            <label className="block space-y-2 text-sm"><span>目标平台</span><Select menuPortal value={target} onChange={value => setTarget(value as QuantExportTarget)} options={quantExportTargets.filter(row => !(containsAlgorithmProgram(candidate.data.expression) || candidate.data.expression?.op === 'python') || row.value === 'python')}/></label>
            {error ? <div role="alert" className="text-sm text-red-600">{error}<QuantButton onClick={() => setAttempt(value => value + 1)}>重试导出</QuantButton></div>
                : !bundle ? <p role="status" className="text-sm text-slate-500">正在生成候选代码…</p> : <>
                    <CodeEditor value={bundle.code} language={target} readOnly compact/>
                    <details><summary className="cursor-pointer text-sm text-slate-600">参数、来源与适用边界</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-xs leading-6 scrollbar-hide">{bundle.manifestJson}</pre></details>
                    <div className="flex flex-wrap justify-end gap-3">
                        <QuantButton onClick={() => downloadQuantBlob(new Blob([bundle.manifestJson], {type: 'application/json'}), `${bundle.filename}.manifest.json`)}>下载参数与来源说明</QuantButton>
                        <QuantButton primary onClick={() => downloadQuantBlob(new Blob([bundle.code], {type: 'text/plain;charset=utf-8'}), bundle.filename)}>下载候选代码</QuantButton>
                    </div>
                </>}
        </div>
    </QuantModal>;
}
