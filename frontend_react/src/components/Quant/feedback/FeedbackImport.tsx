import {useCallback, useEffect, useRef, useState} from 'react';
import type {QuantEntryDetail} from '../../../types/api/quant';
import {feedbackModes, type QuantFeedbackInput, type FeedbackMode, type FeedbackFormat} from '../../../types/api/quantFeedback';
import type {QuantController} from '../../../hooks/useQuant';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {useQuantFactors} from '../../../hooks/useQuantFactors';
import {quantApi} from '../../../api/quant';
import {createRequestKey} from '../../../utils/requestKey';
import {Select} from '../../common/Select';
import {QuantButton, QuantField, QuantModal} from '../ui';
import {decodeFeedbackFile} from '../../../utils/quantFeedbackFile';
import {ConfigurationPreview} from './ConfigurationPreview';
import {useQuantPlatformEvidence} from '../../../hooks/useQuantPlatformEvidence';
import {defaultExecutionOptions, executionDocumentBytes, executionFormats} from '../../../utils/quantPlatformEvidence';
import {decodeExecutionFile} from '../../../utils/quantExecutionTemplates';
import {ExecutionImport} from './evidence/ExecutionImport';
import type {QuantExecutionAdapter} from '../../../types/api/quantPlatformEvidence';

export function FeedbackImport({entry, collection, controller, register, close, saved}: {
    entry: QuantEntryDetail; collection: string; controller: QuantController; register: QuantRegisterDraft;
    close: () => void; saved: (notice: string) => void;
}) {
    const sources = (entry.sources || []).filter(row => row.payload.provenance !== 'external_feedback');
    const [draft, setDraft] = useState<QuantFeedbackInput>(() => ({requestKey: createRequestKey(), title: '', targetSourceId: sources[0]?.id || '',
        factorId: '', experimentResultId: '', mode: 'unknown', documentFormat: 'text', document: '', platform: '', notes: '', analyze: true,
        modelId: controller.models.defaultModelId || controller.models.models[0]?.id || ''}));
    const [baseline] = useState(JSON.stringify(draft));
    const [fileError, setFileError] = useState('');
    const [encoding, setEncoding] = useState('auto');
    const fileRead = useRef(0);
    useEffect(() => () => {fileRead.current++;}, []);
    const [query, setQuery] = useState('');
    const factors = useQuantFactors(collection, {entryId: entry.id, groupBy: 'none', q: query, limit: 100});
    const execution = !!draft.executionAdapter;
    const executionAllowed = !!draft.document.trim() && executionDocumentBytes(draft.document) <= 1024 * 1024;
    const preview = useQuantPlatformEvidence(collection, entry.id, draft.executionAdapter ? {document: draft.document, executionAdapter: draft.executionAdapter, executionOptionsJson: draft.executionOptionsJson || JSON.stringify(defaultExecutionOptions())} : undefined, JSON.stringify([draft.targetSourceId, draft.mode, draft.platform]));
    const patch = <K extends keyof QuantFeedbackInput>(key: K, value: QuantFeedbackInput[K]) => {if (key === 'document') fileRead.current++; setDraft(old => ({...old, [key]: value}));};
    const save = useCallback(async () => {
        const ok = await controller.safe(async () => {
            if (draft.executionAdapter && !preview.valid) throw new Error('执行资料已改变或尚未核对，请先成功预览解析与核算。');
            const result = await quantApi.collectFeedback(collection, entry.id, draft);
            saved(result.notice);
        });
        return ok;
    }, [collection, controller, draft, entry.id, saved, preview.valid]);
    useQuantDraftRegistration('external-feedback', JSON.stringify(draft) !== baseline, save, register, () => setDraft(JSON.parse(baseline) as QuantFeedbackInput));
    const readFile = async (file?: File) => {
        if (!file) return;
        const sequence = ++fileRead.current;
        setFileError('');
        if (file.size > (execution ? 1024 * 1024 : 240000)) {setFileError(execution ? '执行文件最多 1 MiB。' : '文本文件最多 240 KB，正文最多 60000 字符。'); return;}
        try {
            const bytes = await file.arrayBuffer();
            const parsed = execution ? {document: decodeExecutionFile(bytes, encoding), documentFormat: executionFormats[draft.executionAdapter!]} : decodeFeedbackFile(bytes, file.name, encoding);
            if (sequence !== fileRead.current) return;
            setDraft(old => ({...old, ...parsed, title: old.title || file.name, mode: parsed.documentFormat === 'mql_set' ? 'configuration' : old.mode,
                platform: parsed.documentFormat === 'mql_set' ? 'MetaTrader 参数配置' : old.platform}));
        } catch (error) {if (sequence === fileRead.current) setFileError(error instanceof Error ? error.message : '文件读取失败');}
    };
    const experiments = entry.runs.filter(run => run.kind === 'experiment_review' && run.experimentResultId);
    const resultIds = [...new Set(experiments.map(run => run.experimentResultId!))];
    return <QuantModal title="收集使用反馈" close={close} busy={controller.busy} wide>
        <div className="space-y-5">
            <p className="text-sm leading-6 text-slate-500">粘贴报告或心得，AI 自动整理实际参数、指标、失败证据和下一步研究。原文会保留，分析结果可编辑。</p>
            <div className="inline-flex max-w-full rounded-full bg-slate-100 p-1">{[{value: false, label: '报告文字 / SET 配置'}, {value: true, label: '结构化执行证据'}].map(item => <button key={item.label} type="button" onClick={() => {if (execution === item.value) return; fileRead.current++; setFileError(''); setDraft(old => item.value ? {...old, executionAdapter: 'standard-execution-json-v1', executionOptionsJson: JSON.stringify(defaultExecutionOptions()), documentFormat: 'json', mode: old.mode === 'configuration' ? 'unknown' : old.mode} : {...old, executionAdapter: undefined, executionOptionsJson: undefined, documentFormat: 'text'});}} className={`rounded-full px-3 py-2 text-xs font-medium transition ${execution === item.value ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}>{item.label}</button>)}</div>
            <QuantField label="反馈标题" required value={draft.title} onChange={value => patch('title', value)}/>
            <label className="block space-y-2 text-sm"><span>对应的代码或资料来源</span><Select menuPortal value={draft.targetSourceId} onChange={value => setDraft(old => ({...old, targetSourceId: value, factorId: '', experimentResultId: ''}))}
                options={sources.map((source, index) => ({value: source.id, label: `${source.payload.title || source.payload.language || '来源资料'} · ${index + 1}`}))}/></label>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm"><span className="block">记录类型（按你提供的说明）</span><Select menuPortal value={draft.mode} onChange={value => patch('mode', value as FeedbackMode)} options={Object.entries(feedbackModes).filter(([value]) => !execution || value !== 'configuration').map(([value, label]) => ({value, label}))}/></label>
                <QuantField label="平台与版本（可留空）" value={draft.platform} onChange={value => patch('platform', value)} placeholder="例如 MT4 / TradingView"/>
            </div>
            <label className="block space-y-2 text-sm"><span>文件编码</span><Select menuPortal value={encoding} onChange={value => {fileRead.current++; setEncoding(value);}} options={[{value: 'auto', label: '自动：UTF-8 / 带 BOM 的 UTF-16'}, {value: 'gb18030', label: 'GB18030 / 简体中文 ANSI'}, {value: 'windows-1252', label: 'Windows-1252 / 西欧 ANSI'}]}/></label>
            <label className="block space-y-2 text-sm"><span>{execution ? '导入执行记录文件（可选，最多 1 MiB）' : '导入报告或 SET 参数文件（可选）'}</span><input type="file" accept={execution ? '.json,.csv,.html,.htm,.txt' : '.txt,.md,.json,.csv,.html,.htm,.set'} className="block w-full text-sm" onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; void readFile(file);}}/></label>
            {fileError && <p role="alert" className="text-sm text-red-600">{fileError}</p>}
            {execution ? <ExecutionImport adapter={draft.executionAdapter!} optionsJson={draft.executionOptionsJson || JSON.stringify(defaultExecutionOptions())} document={draft.document} allowed={executionAllowed} preview={preview}
                changeAdapter={(value: QuantExecutionAdapter) => {fileRead.current++; setDraft(old => ({...old, executionAdapter: value, documentFormat: executionFormats[value]}));}}
                changeOptions={value => patch('executionOptionsJson', value)} changeDocument={value => patch('document', value)}/>
                : <><label className="block space-y-2 text-sm"><span>报告格式</span><Select menuPortal value={draft.documentFormat} onChange={value => setDraft(old => ({...old, documentFormat: value as FeedbackFormat, mode: value === 'mql_set' ? 'configuration' : old.mode}))} options={[{value: 'text', label: '文字 / Markdown'}, {value: 'json', label: 'JSON'}, {value: 'csv', label: 'CSV'}, {value: 'html', label: 'HTML 报告源码'}, {value: 'mql_set', label: 'MetaTrader SET 参数配置'}]}/></label>
                    <QuantField label="报告或使用心得" required multiline rows={12} value={draft.document} onChange={value => patch('document', value)} placeholder="直接粘贴报告。实际参数、标的、期间、成本、成交明细如有请一并保留；缺失信息由 AI 标明。"/></>}
            {draft.documentFormat === 'mql_set' && <ConfigurationPreview collection={collection} entryId={entry.id} sourceId={draft.targetSourceId} document={draft.document}/>}
            <QuantField label="补充说明（可留空）" multiline rows={3} value={draft.notes} onChange={value => patch('notes', value)}/>
            <details><summary className="cursor-pointer text-sm text-slate-600">关联具体因子或本机实验（可选）</summary><div className="mt-4 space-y-4">
                <QuantField label="搜索本研究的因子" value={query} onChange={setQuery}/>
                {factors.error && <p role="alert" className="text-sm text-red-600">{factors.error} <button onClick={factors.reload}>重试</button></p>}
                <label className="block space-y-2 text-sm"><span>对应因子</span><Select menuPortal value={draft.factorId} onChange={value => patch('factorId', value)} options={[{value: '', label: '关联整个来源'}, ...factors.items.filter(row => row.sourceId === draft.targetSourceId).map(row => ({value: row.id, label: row.curation.name || row.data.name}))]} emptyMessage={factors.loading ? '加载候选中…' : '暂无匹配候选'}/></label>
                <label className="block space-y-2 text-sm"><span>对照本机实验</span><Select menuPortal value={draft.experimentResultId} onChange={value => patch('experimentResultId', value)} options={[{value: '', label: '暂不关联'}, ...resultIds.map(value => ({value, label: experiments.find(run => run.experimentResultId === value)?.result.review?.title || `实验结果 ${value.slice(0, 8)}`}))]}/></label>
            </div></details>
            <label className="block space-y-2 text-sm"><span>分析模型</span><Select menuPortal value={draft.modelId} onChange={value => patch('modelId', value)} options={controller.models.models.map(row => ({value: row.id, label: row.name}))} emptyMessage="尚未配置，仍可保存反馈"/></label>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={draft.analyze} onChange={event => patch('analyze', event.target.checked)} className="accent-orange-500"/>保存后交给 AI 分析并规划下一轮实验</label>
            <p className="text-xs leading-6 text-slate-500">{execution ? '完整原文保留在本地业务数据中。AI 使用固定的核算摘要、全量声明参数和有界差异记录；原平台与实盘真实性仍未独立验证。' : '导入内容会交给所选模型分析。HTML 按文本保存；此模式中的 CSV/JSON 指标和参数是外部声明，未经过本机复算。截图和 PDF 可先保存在附件，当前需要补充可读取的报告文字。'}</p>
            <div className="flex justify-end gap-3"><QuantButton onClick={close}>取消</QuantButton><QuantButton primary disabled={controller.busy || !draft.title.trim() || !draft.document.trim() || !draft.targetSourceId || (execution ? !executionAllowed || !preview.valid : draft.document.length > 60000)} onClick={() => void save()}>{draft.analyze ? '保存并分析反馈' : '保存反馈'}</QuantButton></div>
        </div>
    </QuantModal>;
}
