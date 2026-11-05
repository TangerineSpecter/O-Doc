import {useEffect, useRef, useState, type ReactNode} from 'react';
import {Download, Upload} from 'lucide-react';
import {quantShare} from '../../../api/quantShare';
import {quantError} from '../../../utils/quant';
import {QuantButton, cardClass} from '../ui';
import {ReportMarkdown} from '../ReportMarkdown';

type Package = {entry: {title: string}; source: {code: string; description: string; url: string; language: string; files: unknown[]; related: unknown[]}; report: {markdown: string; data: Record<string, unknown>}};

export function ImportReport({collection, imported}: {collection: string; imported: (id: string) => void}) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return <>
        <input ref={input} type="file" accept=".json,application/json" className="hidden" aria-label="选择报告文件" onChange={async event => {
            const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
            if (!file) return;
            setError('');
            if (file.size > 5 * 1024 * 1024) {setError('报告文件不能超过 5 MB'); return;}
            setBusy(true);
            try {const result = await quantShare.import(collection, await file.text()); imported(result.entryId);}
            catch (cause) {setError(quantError(cause));}
            finally {setBusy(false);}
        }}/>
        <QuantButton size="sm" disabled={busy} onClick={() => input.current?.click()}><Upload size={14}/>{busy ? '导入中…' : '导入报告'}</QuantButton>
        {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </>;
}

export function ExportReport({collection, entry, title}: {collection: string; entry: string; title: string}) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <span className="inline-flex flex-wrap items-center gap-2">
        <QuantButton size="sm" disabled={busy} onClick={async () => {
            setBusy(true); setError('');
            try {
                const {packageJson} = await quantShare.export(collection, entry);
                const url = URL.createObjectURL(new Blob([packageJson], {type:'application/json'}));
                const link = document.createElement('a'); link.href = url;
                link.download = `${title.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').slice(0, 80) || '研究报告'}.odoc-report.json`;
                link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (cause) {setError(quantError(cause));} finally {setBusy(false);}
        }}><Download size={14}/>{busy ? '导出中…' : '导出最新报告'}</QuantButton>
        <span className="text-xs text-slate-500">最新分析的原始正文、评分、参数及源码</span>
        {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>;
}

export function ImportedReport({collection, entry, selectedReportId, children}: {
    collection: string; entry: string; selectedReportId: string; children: ReactNode;
}) {
    const [state, setState] = useState<{entry: string; value: Package | null; error: string} | null>(null);
    useEffect(() => {
        if (selectedReportId) return;
        const abort = new AbortController();
        void quantShare.read(collection, entry, abort.signal).then(result => {
            if (!abort.signal.aborted) setState({entry, value: result.packageJson ? JSON.parse(result.packageJson) as Package : null, error: ''});
        }).catch(cause => {if (!abort.signal.aborted) setState({entry, value: null, error: quantError(cause)});});
        return () => abort.abort();
    }, [collection, entry, selectedReportId]);
    if (selectedReportId) return children;
    if (!state || state.entry !== entry) return <p role="status" className="p-4 text-sm text-slate-500">正在读取报告…</p>;
    if (state.error) return <p role="alert" className="p-4 text-sm text-red-700">{state.error}</p>;
    if (!state.value) return children;
    const {source, report} = state.value;
    const rows = (value: unknown) => Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row)) : [];
    const rawScore = report.data.total_score ?? report.data.totalScore;
    const score = typeof rawScore === 'number' && rawScore >= 0 && rawScore <= 100 ? rawScore : null;
    const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
    return <div className="space-y-4">
        <section className={cardClass}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">导入的研究报告</h2><ExportReport collection={collection} entry={entry} title={state.value.entry.title}/></div><p className="mt-1 text-sm text-slate-500">分享时保存的只读副本，包含报告、参数及源码。附件、回测和完整研究过程不在分享包中，也不会自动重新分析。</p></section>
        <section className={cardClass}><h3 className="mb-3 font-semibold">报告正文</h3><ReportMarkdown text={report.markdown} preserveOriginal/></section>
        <section className={cardClass}><h3 className="font-semibold">研究评分 {score == null ? '—' : `${text(score)} / 100`}</h3><div className="mt-3 space-y-3">{rows(report.data.scores).map((row, i) => <div key={i} className="text-sm leading-6"><strong>{text(row.dimension)}：{text(row.score)}</strong><p>{text(row.reason)}</p>{row.evidence ? <p className="text-slate-500">依据：{text(row.evidence)}</p> : null}</div>)}</div></section>
        <section className={cardClass}><h3 className="font-semibold">参数分析</h3><div className="mt-3 space-y-3">{rows(report.data.parameters).map((row, i) => <div key={i} className="text-sm leading-6"><strong>{text(row.name)}</strong> <span className="text-slate-500">默认值：{text(row.default_value ?? row.defaultValue)}</span><p>{text(row.meaning)}</p>{row.constraints ? <p>约束：{text(row.constraints)}</p> : null}{row.effect ? <p>变化影响：{text(row.effect)}</p> : null}{row.suggestion ? <p>建议：{text(row.suggestion)}</p> : null}{row.evidence ? <p>来源依据：{text(row.evidence)}</p> : null}</div>)}</div></section>
        <section className={cardClass}><h3 className="font-semibold">来源资料 {source.language && <span className="text-sm font-normal text-slate-500">· {source.language}</span>}</h3>{source.description && <p className="mt-3 whitespace-pre-wrap text-sm">{source.description}</p>}{source.url && <p className="mt-3 break-all text-sm">来源：{source.url}</p>}{source.code && <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-xs scrollbar-hide">{source.code}</pre>}{source.related.length > 0 && <details className="mt-3 text-sm"><summary>其他已采用分区的来源</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-xs scrollbar-hide">{JSON.stringify(source.related, null, 2)}</pre></details>}{rows(source.files).map((file, i) => <div key={i} className="mt-3"><h4 className="text-sm font-medium">{text(file.name)}</h4><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-xs scrollbar-hide">{text(file.code)}</pre></div>)}</section>
    </div>;
}
