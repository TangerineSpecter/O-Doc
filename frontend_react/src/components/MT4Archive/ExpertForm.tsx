import {useState} from 'react';
import {Plus, Trash2} from 'lucide-react';
import type {MT4Expert, MT4ExpertInput, MT4Parameter} from '../../types/api/mt4Archive';
import {QuantButton, QuantField, QuantModal, inputClass} from '../Quant/ui';
import {Select} from '../common/Select';

const blank: MT4ExpertInput = {name: '', category: '', version: '', sourceUrl: '', forumUrl: '', minimumCapital: '', timeframe: '', accountRequirement: '', requirements: '', notes: '', tradingLogic: '', parameters: [], parameterSets: []};
const options = (values: string[]) => [{value: '', label: '未填写'}, ...values.map(value => ({value, label: value}))];
const categories = options(['马丁EA', '趋势EA', '震荡EA']);
const timeframes = options(['1M', '5M', '15M', '30M', '1H', '4H', '1D']);
const accountRequirements = options(['无要求', '低点差']);

export function ExpertForm({initial, save, close, busy, error}: {initial?: MT4Expert; save: (data: MT4ExpertInput) => void; close: () => void; busy: boolean; error: string}) {
    const [data, setData] = useState<MT4ExpertInput>(initial || blank);
    const [presetName, setPresetName] = useState('');
    const change = (field: keyof MT4ExpertInput, value: string) => setData(current => ({...current, [field]: value}));
    const parameter = (index: number, changes: Partial<MT4Parameter>) => setData(current => ({...current, parameters: current.parameters.map((item, i) => i === index ? {...item, ...changes} : item)}));
    const capitalValid = !data.minimumCapital || /^\d+(?:\.\d+)?$/.test(data.minimumCapital);
    return <QuantModal title={initial ? '编辑 EA' : '新建 EA'} close={close} busy={busy} wide footer={<><QuantButton onClick={close}>取消</QuantButton><QuantButton primary disabled={busy || !data.name.trim() || !capitalValid} onClick={() => save(data)}>保存 EA</QuantButton></>}>
        <div className="grid gap-4 sm:grid-cols-2">
            <QuantField label="EA 名称" value={data.name} onChange={v => change('name', v)} required />
            <div className="space-y-2 text-sm font-semibold text-slate-700"><span>类型</span><Select menuPortal value={data.category} options={categories} onChange={v => change('category', v)} /></div>
            <QuantField label="版本" value={data.version} onChange={v => change('version', v)} />
            <QuantField label="EA 地址" value={data.sourceUrl} onChange={v => change('sourceUrl', v)} placeholder="https://" />
            <QuantField label="论坛地址" value={data.forumUrl} onChange={v => change('forumUrl', v)} placeholder="https://" />
        </div>
        <div className="mt-5 space-y-4">
            <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">官方最低要求</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-2 text-sm font-semibold text-slate-700"><span>最低资金（美元）</span><input className={`${inputClass} font-normal`} type="text" inputMode="decimal" maxLength={18} value={data.minimumCapital} onChange={e => {const value = e.target.value; if (/^\d*(?:\.\d*)?$/.test(value)) change('minimumCapital', value);}} placeholder="例如 500" />{!capitalValid && <span className="block text-xs font-normal text-red-600">请输入完整的非负数字</span>}</label>
                    <div className="space-y-2 text-sm font-semibold text-slate-700"><span>时间框架</span><Select menuPortal value={data.timeframe} options={timeframes} onChange={v => change('timeframe', v)} /></div>
                    <div className="space-y-2 text-sm font-semibold text-slate-700"><span>账户要求</span><Select menuPortal value={data.accountRequirement} options={accountRequirements} onChange={v => change('accountRequirement', v)} /></div>
                    <QuantField label="额外补充" value={data.requirements} onChange={v => change('requirements', v)} multiline rows={3} placeholder="其他要求；没有可留空" />
                </div>
            </section>
            <QuantField label="注意事项" value={data.notes} onChange={v => change('notes', v)} multiline rows={3} />
            <QuantField label="观察到的交易逻辑" value={data.tradingLogic} onChange={v => change('tradingLogic', v)} multiline rows={4} />
            <section className="space-y-3">
                <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold text-slate-700">参数定义</h3><p className="mt-1 text-xs text-slate-500">参数名与 MT4 报告中的名称一致，默认值可在回测时修改。</p></div><QuantButton onClick={() => setData(current => ({...current, parameters: [...current.parameters, {name: '', label: '', value: '', description: ''}]}))}><Plus size={14}/>添加参数</QuantButton></div>
                {data.parameters.map((item, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_8rem_auto]">
                    <input aria-label="参数名" className={inputClass} placeholder="参数名" value={item.name} onChange={e => parameter(index, {name: e.target.value})}/>
                    <input aria-label="显示名称" className={inputClass} placeholder="显示名称" value={item.label || ''} onChange={e => parameter(index, {label: e.target.value})}/>
                    <input aria-label="默认值" className={inputClass} placeholder="默认值" value={item.value} onChange={e => parameter(index, {value: e.target.value})}/>
                    <Select menuPortal value={item.type || 'text'} options={[{value: 'text', label: '文本'}, {value: 'number', label: '数字'}, {value: 'boolean', label: '布尔值'}]} onChange={type => parameter(index, {type})}/>
                    <button type="button" aria-label="删除参数" className="px-2 text-slate-400 hover:text-red-600" onClick={() => setData(current => ({...current, parameters: current.parameters.filter((_, i) => i !== index)}))}><Trash2 size={16}/></button>
                    <input aria-label="参数说明" className={`${inputClass} sm:col-span-5`} placeholder="参数说明（可选）" value={item.description || ''} onChange={e => parameter(index, {description: e.target.value})}/>
                </div>)}
            </section>
            <section className="space-y-3"><h3 className="text-sm font-semibold text-slate-700">参数组合</h3><p className="text-xs text-slate-500">把当前参数及默认值保存成一套配置，回测时可以选择并调整。</p><div className="flex gap-2"><input className={inputClass} value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="组合名称，例如默认设置"/><QuantButton disabled={!presetName.trim() || !data.parameters.length} onClick={() => {const name = presetName.trim(); setData(current => ({...current, parameterSets: [...current.parameterSets.filter(item => item.name !== name), {name, parameters: current.parameters.map(item => ({...item}))}]})); setPresetName('');}}>保存组合</QuantButton></div>
                {data.parameterSets.map(item => <div key={item.name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span>{item.name} · {item.parameters.length} 个参数</span><button type="button" className="text-slate-500 hover:text-red-600" onClick={() => setData(current => ({...current, parameterSets: current.parameterSets.filter(set => set.name !== item.name)}))}>删除</button></div>)}
            </section>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
    </QuantModal>;
}
