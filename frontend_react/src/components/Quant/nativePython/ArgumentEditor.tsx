import {Select} from '../../common/Select';
import {QuantButton,QuantField} from '../ui';
import {argumentDraft,columns,type ArgumentDraft} from './form';
import type {QuantFactorCandidate} from '../../../types/api/quant';
export function ArgumentEditor({rows,change,candidate}:{rows:ArgumentDraft[];change:(rows:ArgumentDraft[])=>void;candidate:QuantFactorCandidate}) {
    const update=(index:number,patch:Partial<ArgumentDraft>)=>change(rows.map((row,i)=>i===index?{...row,...patch}:row));
    return <section className="space-y-3"><h4 className="text-sm font-semibold">原始函数的全部参数</h4><p className="text-xs leading-6 text-slate-500">同名行情列与候选参数已填入映射提示，可修改。签名扫描不求值；隔离验证会按Python规则执行原模块初始化，函数调用值以本次显式映射为准。源码中的全局常量仍按原文执行，不会改写。</p>
        {rows.map((row,index)=><div key={index} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="grid gap-3 sm:grid-cols-2"><QuantField label={`函数参数 ${index+1}`} value={row.name} onChange={name=>update(index,{name})}/><div className="space-y-2"><label className="text-sm font-semibold">映射方式</label><Select menuPortal aria-label={`参数 ${index+1} 映射方式`} value={row.kind} onChange={kind=>update(index,{kind:kind as ArgumentDraft['kind']})} options={[{value:'',label:'请选择'}, {value:'series',label:'一列行情序列'},{value:'dataframe',label:'多列行情 DataFrame'},{value:'parameter',label:'本次候选实际参数'},{value:'literal',label:'明确填写额外常量'}]}/></div></div>
            {row.kind==='series'&&<Select menuPortal aria-label={`${row.name} 行情列`} value={row.column} onChange={column=>update(index,{column:column as ArgumentDraft['column']})} options={columns.map(value=>({value,label:value}))}/>}
            {row.kind==='parameter'&&<Select menuPortal aria-label={`${row.name} 实际参数`} value={row.parameter} onChange={parameter=>update(index,{parameter})} options={[{value:'',label:'选择上方实际参数'},...candidate.data.parameters.map(value=>({value:value.name,label:value.name}))]}/>}
            {row.kind==='dataframe'&&<div className="flex flex-wrap gap-3">{[...columns,'timestamp' as const].map(column=><label key={column} className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={row.columns.includes(column)} onChange={event=>update(index,{columns:event.target.checked?[...row.columns,column]:row.columns.filter(value=>value!==column)})}/>{column}</label>)}</div>}
            {row.kind==='literal'&&<div className="grid gap-3 sm:grid-cols-2"><Select menuPortal aria-label={`${row.name} 常量类型`} value={row.literalType} onChange={literalType=>update(index,{literalType:literalType as ArgumentDraft['literalType']})} options={[{value:'number',label:'数值'},{value:'boolean',label:'布尔值 true / false'},{value:'string',label:'文本（不加引号）'},{value:'null',label:'空值 None'}]}/>{row.literalType!=='null'&&<QuantField label={`${row.name} 本次值`} value={row.literal} onChange={literal=>update(index,{literal})}/>}</div>}
            <QuantButton onClick={()=>change(rows.filter((_,i)=>i!==index))}>移除此参数</QuantButton>
        </div>)}
        <QuantButton disabled={rows.length>=40} onClick={()=>change([...rows,argumentDraft('',candidate)])}>添加函数参数</QuantButton>
    </section>;
}
