import {useState} from 'react';
import {quantValidations} from '../../../api/quantValidations';
import {useQuantDatasets} from '../../../hooks/useQuantDatasets';
import type {QuantValidation} from '../../../types/api/quantValidation';
import {readPreview} from '../../../utils/quantValidation';
import {Select} from '../../common/Select';
import {QuantButton} from '../ui';
import {ValidationAudit} from './ValidationAudit';
export function BindValidation({collection,plan,busy,act,datasets}: {collection: string;plan: QuantValidation;busy: boolean;act: (action: ()=>Promise<QuantValidation>)=>Promise<void>;datasets: ()=>void}) {
    const [offset,setOffset]=useState(0),[selected,setSelected]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
    const [prepared,setPrepared]=useState<{dataset: string;value: ReturnType<typeof readPreview>}>();
    const source=useQuantDatasets(collection,offset,'');
    const dataset=source.items.find(r=>r.id===selected) || source.items[0];
    const preview=prepared && prepared.dataset===dataset?.id?prepared.value:undefined;
    const inspect=async()=>{
        if (!dataset || pending) return;setPending(true);setError('');setPrepared(undefined);
        try {const result=await quantValidations.preview(collection,plan.id,dataset.id);setPrepared({dataset:dataset.id,value:readPreview(result.previewJson)});}
        catch(cause) {setError(cause instanceof Error?cause.message:'行情无法用于此验证');}
        finally {setPending(false);}
    };
    return <div className="space-y-4"><div className="flex flex-wrap items-center gap-2"><QuantButton onClick={datasets}>导入后续行情</QuantButton><QuantButton onClick={source.reload}>刷新行情</QuantButton></div>
        <p className="text-xs leading-6 text-slate-500">行情需包含首个新开盘之前的预热与信号柱，以及登记的完整收益区间。每个计划只绑定一次；停止和失败也保留数据使用记录。</p>
        {source.loading?<p role="status" className="text-sm text-slate-500">正在加载验证行情…</p>:source.error?<p role="alert" className="text-sm text-red-600">{source.error}</p>:!source.items.length?<p className="text-sm text-slate-500">暂无行情，先导入 CSV。</p>:<Select aria-label="固定验证行情" menuPortal value={dataset?.id || ''} options={source.items.map(r=>({value:r.id,label:`${r.name} · ${r.rowCount} 根 · ${r.symbol} ${r.timeframe}`}))} onChange={id=>{setSelected(id);setPrepared(undefined);setError('');}}/>}
        {source.total>20 && <div className="flex gap-2"><QuantButton disabled={!offset} onClick={()=>{setOffset(v=>Math.max(0,v-20));setPrepared(undefined);}}>上一页行情</QuantButton><QuantButton disabled={offset+20>=source.total} onClick={()=>{setOffset(v=>v+20);setPrepared(undefined);}}>下一页行情</QuantButton></div>}
        <QuantButton disabled={!dataset || pending || busy || source.loading || !!source.error} onClick={()=>void inspect()}>{pending?'正在核对…':'核对区间与数据使用'}</QuantButton>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {preview && <><p className="break-words text-xs leading-6 text-slate-600">固定评价：{preview.bounds.start_timestamp} → {preview.bounds.end_timestamp}<br/>当前文件{preview.imported_after_registration?'在登记之后导入':'在登记之前已导入'}。</p><ValidationAudit value={preview.audit} label="预约前审计"/>
            <div className="flex flex-wrap gap-2"><QuantButton primary disabled={busy || !preview.fresh_allowed} onClick={()=>void act(()=>quantValidations.run(collection,plan.id,dataset!.id,'fresh'))}>用新数据验证</QuantButton><QuantButton disabled={busy} onClick={()=>void act(()=>quantValidations.run(collection,plan.id,dataset!.id,'replication'))}>普通复核（允许已用数据）</QuantButton></div>
            {!preview.fresh_allowed && <p className="text-xs leading-6 text-amber-700">当前不满足登记后导入且无已知重用的条件，可导入新数据或明确选择普通复核。</p>}</>}
    </div>;
}
