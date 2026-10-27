import {useState} from 'react';
import type {MT4Test} from '../../types/api/mt4Archive';
import {QuantButton, QuantField, QuantModal, inputClass} from '../Quant/ui';

export function EditTestForm({test, close, save, busy, error}: {test: MT4Test; close: () => void; save: (data: Partial<MT4Test>) => void; busy: boolean; error: string}) {
    const [title, setTitle] = useState(test.title);
    const [description, setDescription] = useState(test.description);
    const [conclusion, setConclusion] = useState(test.conclusion);
    const [data, setData] = useState(() => structuredClone(test.data));
    return <QuantModal title="编辑回测记录" close={close} busy={busy} wide footer={<><QuantButton onClick={close}>取消</QuantButton><QuantButton primary disabled={busy || !title.trim()} onClick={() => save({title, description, conclusion, data})}>保存修改</QuantButton></>}>
        <div className="space-y-4"><QuantField label="回测标题" value={title} onChange={setTitle} required/><QuantField label="回测说明" value={description} onChange={setDescription} multiline rows={3}/><div className="grid gap-4 sm:grid-cols-2">{[['symbol', '交易品种'], ['period', '周期与时间区间'], ['model', '复盘模型']].map(([key, label]) => <QuantField key={key} label={label} value={data.fields?.[key] || ''} onChange={value => setData(current => ({...current, fields: {...current.fields, [key]: value}}))}/>)}</div>
            <div><h3 className="text-sm font-semibold text-slate-700">参数快照</h3><div className="mt-2 space-y-2">{(data.parameters || []).map((param, index) => <div key={index} className="grid grid-cols-2 gap-2"><span className="py-2 text-sm text-slate-600">{param.label || param.name}</span><input aria-label={`${param.label || param.name} 参数值`} className={inputClass} value={param.value} onChange={e => setData(current => ({...current, parameters: current.parameters?.map((item, i) => i === index ? {...item, value: e.target.value} : item)}))}/></div>)}</div></div>
            <div><h3 className="text-sm font-semibold text-slate-700">指标</h3><div className="mt-2 max-h-64 space-y-2 overflow-y-auto scrollbar-hide">{(data.metrics || []).map((row, rowIndex) => <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" key={rowIndex}>{row.map((cell, index) => <input aria-label={`指标 ${rowIndex + 1} 字段 ${index + 1}`} key={index} className={inputClass} value={cell} onChange={e => setData(current => ({...current, metrics: current.metrics?.map((oldRow, i) => i === rowIndex ? oldRow.map((old, j) => j === index ? e.target.value : old) : oldRow)}))}/>)}</div>)}</div><QuantButton className="mt-2" onClick={() => setData(current => ({...current, metrics: [...(current.metrics || []), ['', '']]}))}>添加指标</QuantButton></div>
            <QuantField label="回测结论" value={conclusion} onChange={setConclusion} multiline rows={4}/>
            <p className="text-xs text-slate-500">修改不会覆盖上传的原始报告，交易事件仍按导入时保留。</p>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
    </QuantModal>;
}
