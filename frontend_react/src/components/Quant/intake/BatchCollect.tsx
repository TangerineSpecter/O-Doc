import {useCallback, useRef, useState} from 'react';
import {quantApi} from '../../../api/quant';
import type {QuantModels} from '../../../types/api/quant';
import type {QuantMaterial, QuantBatchInput} from '../../../types/api/quantIntake';
import {createRequestKey} from '../../../utils/requestKey';
import {decodeSourceFile, emptyMaterial, validateMaterials} from '../../../utils/quantIntake';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {Select} from '../../common/Select';
import {QuantButton, QuantField} from '../ui';
import {MaterialEditor} from './MaterialEditor';

export function BatchCollect({collection, models, register, created, cancel}: {collection: string; models: QuantModels; register: QuantRegisterDraft; created: () => void; cancel: () => void}) {
    const [draft, setDraft] = useState<QuantBatchInput>(() => ({requestKey: createRequestKey(), name: '批量收集', items: [emptyMaterial()],
        analyze: true, modelId: models.defaultModelId || models.models[0]?.id || '', wallSeconds: 1800}));
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [encoding, setEncoding] = useState('auto');
    const sending = useRef(false);
    const dirty = busy || draft.items.some(row => row.code || row.description || row.url || row.title);
    const validation = validateMaterials(draft.items);
    const save = useCallback(async () => {
        const invalid = validateMaterials(draft.items);
        if (invalid || sending.current) {setError(invalid); return false;}
        sending.current = true; setBusy(true); setError('');
        try {
            await quantApi.startBatch(collection, draft);
            register('batch-intake', null); created(); return true;
        } catch (cause) {setError(cause instanceof Error ? cause.message : '批次保存失败，资料仍保留在表单'); return false;}
        finally {sending.current = false; setBusy(false);}
    }, [collection, draft, register, created]);
    useQuantDraftRegistration('batch-intake', dirty, save, register, () => setDraft(current => ({...current, items: []})));
    const setItems = (items: QuantMaterial[]) => setDraft(current => ({...current, items}));
    const upload = async (files: File[]) => {
        if (!files.length || sending.current) return;
        sending.current = true;
        setError(''); setBusy(true);
        try {
            const existing = draft.items.filter(row => row.code || row.description || row.url || row.title);
            if (existing.length + files.length > 20) throw new Error('单批最多 20 份资料。');
            if (files.reduce((sum, file) => sum + file.size, 0) > 1000000) throw new Error('单次导入文件总量不能超过 1 MB。');
            const added = await Promise.all(files.map(async file => decodeSourceFile(await file.arrayBuffer(), file.name, encoding)));
            const items = [...existing, ...added], invalid = validateMaterials(items);
            if (invalid) throw new Error(invalid);
            setItems(items);
        } catch (cause) {setError(cause instanceof Error ? cause.message : '文件读取失败');}
        finally {sending.current = false; setBusy(false);}
    };
    return <div className="space-y-5">
        <p className="text-sm leading-6 text-slate-600">每份资料独立生成报告和评价。可一次导入多个源文件，也可逐份粘贴代码、说明或网址。</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <fieldset disabled={busy} className="min-w-0 space-y-4 disabled:opacity-60">
            <QuantField label="批次名称" value={draft.name} onChange={name => setDraft(current => ({...current, name}))} />
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2 text-sm font-semibold"><span>源文件编码</span><Select menuPortal value={encoding} onChange={setEncoding} options={[{value: 'auto', label: 'UTF-8 / UTF-16 BOM 自动'}, {value: 'gb18030', label: 'GB18030 / GBK'}, {value: 'windows-1252', label: 'Windows-1252'}]} /></label>
                <label className="block space-y-2 text-sm font-semibold"><span>导入多个源文件</span><input aria-label="导入多个源文件" type="file" multiple accept=".py,.pine,.mq4,.mqh,.txt,.md" className="block w-full text-sm" onChange={event => {const files = Array.from(event.target.files || []); event.target.value = ''; void upload(files);}} /></label>
            </div>
            {draft.items.map((material, index) => <MaterialEditor key={index} ordinal={index + 1} material={material} change={value => setItems(draft.items.map((row, i) => i === index ? value : row))} remove={() => setItems(draft.items.filter((_, i) => i !== index))} />)}
            <QuantButton disabled={draft.items.length >= 20} onClick={() => setItems([...draft.items, emptyMaterial()])}>添加一份资料</QuantButton>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.analyze} onChange={event => setDraft(current => ({...current, analyze: event.target.checked}))} />归档后自动分析</label>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2 text-sm font-semibold"><span>分析模型</span><Select menuPortal value={draft.modelId} onChange={modelId => setDraft(current => ({...current, modelId}))} options={models.models.map(model => ({value: model.id, label: model.name}))} emptyMessage="未配置模型，先归档" /></label>
                <QuantField label="批次时间上限（秒，30–3600）" type="number" value={String(draft.wallSeconds)} onChange={value => setDraft(current => ({...current, wallSeconds: Number(value)}))} />
            </div>
        </fieldset>
        <p className="text-sm leading-6 text-slate-600">{draft.items.length} 份资料 · 最多 {draft.analyze ? draft.items.length * 7 : 0} 次模型分析调用 · 含排队最长 {draft.wallSeconds} 秒。按顺序执行，失败项保留供重试。自动向量索引另按现有设置执行；此处不估算费用。</p>
        <div className="flex flex-wrap justify-end gap-3"><QuantButton disabled={busy} onClick={cancel}>返回批次</QuantButton><QuantButton primary disabled={busy || !!validation || !draft.name.trim() || !Number.isInteger(draft.wallSeconds) || draft.wallSeconds < 30 || draft.wallSeconds > 3600} onClick={() => void save()}>{busy ? '正在保存…' : draft.analyze ? '归档并开始分析' : '批量归档'}</QuantButton></div>
        {validation && dirty && <p className="text-sm text-slate-500">{validation}</p>}
    </div>;
}
