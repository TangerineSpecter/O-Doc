import {useCallback, useState} from 'react';
import {quantApi} from '../../api/quant';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../hooks/useQuantNavigation';
import type {QuantDataset, QuantDatasetInput} from '../../types/api/quantDataset';
import {QuantButton, QuantField, QuantModal, inputClass} from './ui';
const initial: QuantDatasetInput = {name: '', csvText: '', symbol: '', timeframe: '', timezone: 'Asia/Shanghai', priceAdjustment: '', source: ''};
export function DatasetImport({collection, close, saved, register}: {collection: string; close: () => void; saved: (dataset: QuantDataset) => void; register: QuantRegisterDraft}) {
    const [draft, setDraft] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [clean, setClean] = useState(false);
    const patch = (key: keyof QuantDatasetInput, value: string) => setDraft(current => ({...current, [key]: value}));
    const save = useCallback(async () => {
        if (busy) return false;
        setError(''); setBusy(true);
        try {
            const dataset = await quantApi.importDataset(collection, draft);
            setClean(true); saved(dataset); return true;
        } catch (cause) {setError(cause instanceof Error ? cause.message : '导入失败，请检查行情格式'); return false;}
        finally {setBusy(false);}
    }, [busy, collection, draft, saved]);
    useQuantDraftRegistration('market-data', !clean && JSON.stringify(draft) !== JSON.stringify(initial), save, register, () => setDraft(initial));
    const readFile = async (file?: File) => {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {setError('CSV 文件最多 2 MiB'); return;}
        setBusy(true); setError('');
        try {
            const csvText = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer());
            setDraft(current => ({...current, csvText, name: current.name || file.name.replace(/\.csv$/i, '')}));
        } catch {setError('无法读取文件，请使用 UTF-8 编码的 CSV');}
        finally {setBusy(false);}
    };
    return <QuantModal title="导入历史行情" close={close} busy={busy} wide>
        <p className="text-sm leading-7 text-slate-500">保留原 CSV 和数据口径，作为后续参数与组合实验的固定输入。每份文件包含一个标的、一个周期，最多 20,000 行 / 2 MiB。</p>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">选择 CSV 文件<input type="file" accept=".csv,text/csv" disabled={busy} className={inputClass} onChange={event => void readFile(event.target.files?.[0])} /></label>
        <QuantField label="CSV 内容" value={draft.csvText} onChange={value => patch('csvText', value)} multiline rows={5} placeholder={'timestamp,open,high,low,close,volume\n2024-01-01,100,102,99,101,1000'} />
        <p className="text-xs leading-6 text-slate-500">必需列：timestamp、open、high、low、close。volume 可选。时间使用 YYYY-MM-DD 或带时区偏移的 ISO 格式；重复时间、乱序和无效价格会被拒绝。</p>
        <div className="grid gap-4 sm:grid-cols-2">{([['name', '行情名称', '例如：某标的日线历史'], ['symbol', '标的', '例如：交易所:代码'], ['timeframe', 'K线周期', '例如：1d / 1h / 5m'], ['timezone', '时区', 'Asia/Shanghai / UTC'], ['priceAdjustment', '复权口径', '前复权 / 后复权 / 不复权；未知可留空'], ['source', '行情来源', '提供方或数据出处；未知可留空']] as const).map(([key, label, placeholder]) => <QuantField key={key} label={label} value={draft[key]} onChange={value => patch(key, value)} placeholder={placeholder} required={!['priceAdjustment', 'source'].includes(key)} />)}</div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3"><QuantButton onClick={close} disabled={busy}>取消</QuantButton><QuantButton primary onClick={() => void save()} disabled={busy || !draft.csvText.trim()}>保存行情快照</QuantButton></div>
    </QuantModal>;
}
