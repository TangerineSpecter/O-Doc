import {useQuantDraftRegistration,type QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {createRequestKey} from '../../../utils/requestKey';
import {useState} from 'react';
import type {QuantFactorCandidate} from '../../../types/api/quant';
import type {QuantDataset} from '../../../types/api/quantDataset';
import type {NativeOptions,NativePythonInput,NativePythonRecord} from '../../../types/api/quantNativePython';
import {nativePythonApi} from '../../../api/quantNativePython';
import {Select} from '../../common/Select';
import {QuantButton,QuantField,QuantModal} from '../ui';
import {SeedEditor} from '../experiments/SeedEditor';
import {buildSeed,initialSeed} from '../experiments/plan';
import {ArgumentEditor} from './ArgumentEditor';
import {buildArguments,signatureArguments} from './form';
export function NativeForm({collection,candidate,options,datasets,register,close,saved}:{collection:string;candidate:QuantFactorCandidate;options:NativeOptions;datasets:QuantDataset[];register:QuantRegisterDraft;close:()=>void;saved:(record:NativePythonRecord)=>void}) {
    const first=options.source?.signatures.find(row=>row.supported)?.name||options.source?.entrypoints[0]||'';
    const [entrypoint,setEntrypoint]=useState(first),[args,setArgs]=useState(()=>signatureArguments(options,candidate,first));
    const [seed,setSeed]=useState(()=>initialSeed(candidate));
    const firstDataset=datasets.find(row=>row.rowCount>=30)||datasets[0];
    const [form,setForm]=useState({name:`${candidate.curation.name} · 原始Python对照`,dataset:firstDataset?.id||'',offset:'0',count:String(Math.min(2000,Math.max(30,firstDataset?.rowCount||2000))),seconds:'10',warmup:'0',absolute:'0.000000001',relative:'0.00000001',index:'range' as 'range'|'timestamps',column:'',analyze:true});
    const [busy,setBusy]=useState(false),[error,setError]=useState('');
    const [initial]=useState(()=>JSON.stringify([entrypoint,args,seed,form]));
    useQuantDraftRegistration('native-python-'+candidate.id,JSON.stringify([entrypoint,args,seed,form])!==initial,undefined,register);
    const field=(key:'name'|'offset'|'count'|'seconds'|'warmup'|'absolute'|'relative'|'column')=>(value:string)=>setForm(previous=>({...previous,[key]:value}));
    const save=async()=>{
        setError('');
        try{
            const actual=buildSeed(candidate,seed,false);
            const integer=(text:string,min:number,max:number)=>{const number=Number(text);if (!text.trim()||!Number.isInteger(number)||number<min||number>max)throw new Error(`行数、偏移或运行预算超出范围：${min}–${max}`);return number;};
            const tolerance=(text:string)=>{const number=Number(text);if (!text.trim()||!Number.isFinite(number)||number<0||number>.001)throw new Error('容差须为0–0.001的有限数值');return number;};
            if (!options.source||!form.dataset||!entrypoint.trim())throw new Error('请选择行情并填写原始函数名');
            const input:NativePythonInput={requestKey:createRequestKey(),name:form.name,sourceId:options.source.id,datasetId:form.dataset,
                bindings:actual.bindings,parameters:actual.parameters,entrypoint,arguments:buildArguments(args),index:form.index,outputColumn:form.column,
                offset:integer(form.offset,0,19999),rowCount:integer(form.count,30,20000),seconds:integer(form.seconds,1,30),warmupBars:integer(form.warmup,0,2000),
                absoluteTolerance:tolerance(form.absolute),relativeTolerance:tolerance(form.relative),analyze:form.analyze};
            setBusy(true);saved(await nativePythonApi.start(collection,candidate.id,input));
        }catch(cause){setError(cause instanceof Error?cause.message:'验证任务创建失败');}finally{setBusy(false);}
    };
    return <QuantModal title="原始Python函数验证与AI解读" wide close={close} busy={busy}>
        <div className="space-y-5 p-5">
            <p className="rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">原始文本在无网络、无主机目录挂载的低权限容器运行，与当前候选表达式逐行比较。验证绑定本次源码、实际参数、行情和容差，不是收益测试。</p>
            <QuantField label="验证名称" value={form.name} onChange={field('name')}/>
            <div className="space-y-2"><label className="text-sm font-semibold">已导入行情</label><Select menuPortal aria-label="Python验证行情" value={form.dataset} onChange={dataset=>setForm(previous=>({...previous,dataset,count:String(Math.min(2000,datasets.find(row=>row.id===dataset)?.rowCount||2000))}))} options={[{value:'',label:'选择已有行情'},...datasets.map(row=>({value:row.id,label:`${row.name} · ${row.symbol} · ${row.rowCount}行`}))]}/><p className="text-xs leading-6 text-slate-500">使用实验室中已导入的行情；此处列出最近20份。</p></div>
            <SeedEditor candidate={candidate} draft={seed} change={setSeed}/>
            <QuantField label="原始函数名" value={entrypoint} onChange={setEntrypoint}/>
            {!!options.source?.signatures.length&&<div className="space-y-2"><p className="text-xs text-slate-500">从源码读取的函数签名提示：</p><div className="flex flex-wrap gap-2">{options.source.signatures.map(row=><QuantButton key={row.name} disabled={!row.supported} onClick={()=>{setEntrypoint(row.name);setArgs(signatureArguments(options,candidate,row.name));}}>{row.name}（{row.arguments.map(arg=>arg.name).join(', ')}）</QuantButton>)}</div><p className="break-words text-xs leading-6 text-slate-400">默认表达式：{options.source.signatures.find(row=>row.name===entrypoint)?.arguments.filter(row=>row.defaultText).map(row=>`${row.name}=${row.defaultText}`).join('；')||'未声明或无法读取'}。每个参数仍须显式映射。</p></div>}
            <ArgumentEditor rows={args} change={setArgs} candidate={candidate}/>
            <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">固定片段、输出与运行预算</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
                <QuantField label="起始偏移（从0计）" value={form.offset} onChange={field('offset')}/><QuantField label="固定行数（30–20000）" value={form.count} onChange={field('count')}/>
                <QuantField label="共同预热行数" value={form.warmup} onChange={field('warmup')}/><QuantField label="源码运行秒数（1–30）" value={form.seconds} onChange={field('seconds')}/>
                <QuantField label="绝对容差" value={form.absolute} onChange={field('absolute')}/><QuantField label="相对容差" value={form.relative} onChange={field('relative')}/>
                <div className="space-y-2"><label className="text-sm font-semibold">传入数据索引</label><Select menuPortal value={form.index} onChange={index=>setForm(previous=>({...previous,index:index as typeof form.index}))} options={[{value:'range',label:'从0开始的行号索引'},{value:'timestamps',label:'UTC时间戳索引'}]}/></div>
                <QuantField label="DataFrame / 字典输出列（可空）" value={form.column} onChange={field('column')}/>
            </div></details>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.analyze} onChange={event=>setForm(previous=>({...previous,analyze:event.target.checked}))}/>完成后让AI分析并复核（默认对话模型，最多3次调用、6分钟，最多修订一次）</label>
            {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3"><QuantButton disabled={busy} onClick={close}>取消</QuantButton><QuantButton primary disabled={busy||!datasets.length} onClick={()=>void save()}>{busy?'正在固定方案…':'运行原始函数并生成解读'}</QuantButton></div>
        </div>
    </QuantModal>;
}
