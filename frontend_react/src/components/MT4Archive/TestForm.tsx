import {useState} from 'react';
import {uploadResource} from '../../api/resources';
import {mt4Api} from '../../api/mt4Archive';
import type {MT4Expert, MT4Parameter, MT4Preview, MT4Report} from '../../types/api/mt4Archive';
import {QuantButton, QuantField, QuantModal, inputClass} from '../Quant/ui';
import {Select} from '../common/Select';

export function TestForm({collection, expert, close, saved}: {collection: string; expert: MT4Expert; close: () => void; saved: () => Promise<void>}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [conclusion, setConclusion] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [image, setImage] = useState<File | null>(null);
    const [assetId, setAssetId] = useState('');
    const [preview, setPreview] = useState<MT4Preview | null>(null);
    const [params, setParams] = useState<MT4Parameter[]>(expert.parameters.map(p => ({...p})));
    const [setName, setSetName] = useState('');
    const [metrics, setMetrics] = useState<{name: string; value: string}[]>([]);
    const [visionModel, setVisionModel] = useState('');
    const [fields, setFields] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [allowDuplicate, setAllowDuplicate] = useState(false);
    const run = async (work: () => Promise<void>) => {setBusy(true); setError(''); try {await work();} catch (e) {setError(e instanceof Error ? e.message : '操作失败，请重试');} finally {setBusy(false);}};
    const inspect = () => run(async () => {
        if (!file) return;
        const asset = await uploadResource(file, 'quant');
        const result = await mt4Api.preview(collection, expert.id, asset.id);
        setAssetId(asset.id); setPreview(result); setAllowDuplicate(false);
        setParams((result.report.parameters || []).map(item => ({...expert.parameters.find(definition => definition.name === item.name), ...item})));
        setFields(result.report.fields || {});
        if (!title) setTitle(result.report.title?.replace(/^Strategy Tester:\s*/i, '') || file.name);
    });
    const recognize = () => run(async () => {
        if (!image) return;
        const asset = await uploadResource(image, 'quant');
        const result = await mt4Api.recognize(collection, expert.id, asset.id);
        setMetrics(result.metrics);
        setVisionModel(result.modelName);
    });
    const submit = () => run(async () => {
        const report: MT4Report = {...(preview?.report || {}), fields, parameters: params, expertVersion: expert.version, source: preview ? 'html' : visionModel ? 'vision' : 'manual', visionModel, hasChart: preview?.hasChart || false};
        if (metrics.length) report.metrics = [...(report.metrics || []), ...metrics.map(item => [item.name, item.value])];
        const imageAssetId = image ? (await uploadResource(image, 'quant')).id : undefined;
        await mt4Api.createTest(collection, expert.id, {title, description, conclusion, data: report, reportAssetId: assetId || undefined, imageAssetId, allowDuplicate});
        await saved();
    });
    return <QuantModal title="添加回测记录" close={close} wide busy={busy} footer={<><QuantButton onClick={close} disabled={busy}>取消</QuantButton><QuantButton primary disabled={busy || !title.trim() || (!!file && !preview) || (!!preview?.duplicates.length && !allowDuplicate)} onClick={submit}>{busy ? '处理中…' : '保存回测'}</QuantButton></>}>
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2"><QuantField label="回测标题" value={title} onChange={setTitle} required/><QuantField label="回测说明" value={description} onChange={setDescription} placeholder="例如品种、周期和使用条件"/></div>
            <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-800">导入 MT4 报告</h3><p className="mt-1 text-xs text-slate-500">选择 HTML 或 ZIP；曲线图片可选，也可保存后补充。</p><div className="mt-3 flex flex-wrap items-center gap-3"><input type="file" accept=".htm,.html,.zip" disabled={busy} onChange={e => {setFile(e.target.files?.[0] || null); setPreview(null); setAssetId('');}} className="text-sm text-slate-600"/><QuantButton disabled={!file || busy} onClick={inspect}>解析并预览</QuantButton></div>
                {preview && <div className="mt-3 space-y-1 text-sm text-slate-600">{preview.report.source === 'local-demo' && <p className="text-amber-700">本地样例数据，仅演示流程，未解析所选文件。</p>}<p>{preview.report.fields?.symbol || '品种未识别'} · {preview.report.fields?.period || '周期未识别'}</p><p>识别到 {preview.report.events?.length || 0} 条交易事件、{preview.report.metrics?.length || 0} 行指标{preview.hasChart ? ' · ZIP 包含曲线图' : ' · 未包含曲线图'}</p>{!!preview.duplicates.length && <label className="block text-amber-700"><input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)}/> 已存在相同报告（{preview.duplicates.map(x => x.title).join('、')}），仍要新建</label>}</div>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">{[['symbol', '交易品种'], ['period', '周期与时间区间'], ['model', '复盘模型']].map(([key, label]) => <QuantField key={key} label={label} value={fields[key] || ''} onChange={value => setFields(current => ({...current, [key]: value}))}/>)}</div>
            {!!preview?.report.metrics?.length && <div><h3 className="text-sm font-semibold text-slate-800">报告指标 · 可核对修改</h3><div className="mt-2 max-h-56 space-y-2 overflow-y-auto scrollbar-hide">{preview.report.metrics.map((row, rowIndex) => <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" key={rowIndex}>{row.map((cell, index) => <input key={index} className={inputClass} aria-label={`指标 ${rowIndex + 1} 字段 ${index + 1}`} value={cell} onChange={e => setPreview(current => current ? {...current, report: {...current.report, metrics: current.report.metrics?.map((oldRow, i) => i === rowIndex ? oldRow.map((old, j) => j === index ? e.target.value : old) : oldRow)}} : null)}/>)}</div>)}</div></div>}
            <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-800">图片附件</h3><p className="mt-1 text-xs text-slate-500">有 HTML 时可附曲线图；只有截图时可使用系统识图模型提取指标，保存前请核对。</p><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={busy} onChange={e => {setImage(e.target.files?.[0] || null); if (visionModel) setMetrics([]); setVisionModel('');}} className="mt-3 block text-sm text-slate-600"/>{!preview && <QuantButton className="mt-3" disabled={!image || busy} onClick={recognize}>识别截图指标</QuantButton>}{visionModel && <p className="mt-2 text-xs text-slate-500">识图模型：{visionModel}；{metrics.length ? '结果仅供核对。' : '未识别到可用指标，可手工填写。'}</p>}</div>
            <div><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-800">参数快照</h3>{expert.parameterSets.length > 0 && <div className="w-48"><Select value={setName} options={[{value: '', label: '选择参数组合'}, ...expert.parameterSets.map(item => ({value: item.name, label: item.name}))]} menuPortal onChange={name => {setSetName(name); const set = expert.parameterSets.find(item => item.name === name); if (set) setParams(set.parameters.map(item => ({...item})));}}/></div>}</div><div className="mt-2 space-y-2">{params.map((p, index) => <div key={index} className="grid grid-cols-2 gap-2"><input className={inputClass} aria-label="参数名称" value={p.label || p.name} readOnly/><input className={inputClass} aria-label="参数值" value={p.value} onChange={e => setParams(current => current.map((v, i) => i === index ? {...v, value: e.target.value} : v))}/></div>)}{!params.length && <p className="text-xs text-slate-500">EA 暂未配置参数，也可以导入报告自动识别。</p>}</div></div>
            <div><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">补充指标{metrics.length > 0 && image && !preview ? ' · 请核对识别结果' : ''}</h3><QuantButton onClick={() => setMetrics(current => [...current, {name: '', value: ''}])}>添加指标</QuantButton></div><div className="mt-2 space-y-2">{metrics.map((metric, index) => <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={index}><input aria-label="指标名称" className={inputClass} value={metric.name} onChange={e => setMetrics(current => current.map((v, i) => i === index ? {...v, name: e.target.value} : v))}/><input aria-label="指标数值" className={inputClass} value={metric.value} onChange={e => setMetrics(current => current.map((v, i) => i === index ? {...v, value: e.target.value} : v))}/><button type="button" className="text-sm text-slate-500" onClick={() => setMetrics(current => current.filter((_, i) => i !== index))}>删除</button></div>)}</div></div>
            <QuantField label="回测结论" value={conclusion} onChange={setConclusion} multiline rows={3}/>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
    </QuantModal>;
}
