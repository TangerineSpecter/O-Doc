import {useRef,useState} from 'react';
import {quantValidations} from '../api/quantValidations';
import {createRequestKey} from '../utils/requestKey';
import {quantError} from '../utils/quant';
import {freezeCriteria} from '../utils/quantValidationCriteria';
import type {QuantCriteriaInput} from '../types/api/quantValidationCriteria';
import type {QuantLabelTarget} from '../types/api/quantLabels';

export type CriteriaForm=Record<keyof Required<QuantCriteriaInput>,string>;
export function useQuantValidationRegistration(collection:string,source:string,attempt:string,name:string,saved:(id:string)=>void,inheritedLabel?:QuantLabelTarget) {
    const [form,setForm]=useState({name:`固定验证 · ${name} · ${attempt}`.slice(0,200),symbol:'',timeframe:'',intervals:'30',seconds:'30'});
    const [enabled,setEnabled]=useState(false);
    const [labelEnabled,setLabelEnabled]=useState(!!inheritedLabel),[horizon,setHorizon]=useState(String(inheritedLabel?.horizon_bars || 5));
    const [criteria,setCriteria]=useState<CriteriaForm>({minTotalReturn:'',maxDrawdown:'',minExcessReturn:'',minSignalCoverage:'',minEntries:''});
    const [busy,setBusy]=useState(false),[error,setError]=useState('');
    const key=useRef(createRequestKey()),pending=useRef(false);
    const changed=()=>{key.current=createRequestKey();setError('');};
    const submit=async()=>{
        if (pending.current) return;
        pending.current=true;setBusy(true);setError('');
        try {
            if (!/^\d+$/.test(form.intervals) || !/^\d+$/.test(form.seconds) || Number(form.intervals)<5 || Number(form.intervals)>2000 || Number(form.seconds)<1 || Number(form.seconds)>60) throw new Error('收益区间须为5–2000，计算预算须为1–60秒整数');
            let rules:QuantCriteriaInput|undefined;
            if (enabled) {
                rules={};
                for (const [field,text] of Object.entries(criteria)) {
                    if (!text.trim()) continue;
                    if (field==='minEntries' && !/^\d+$/.test(text)) throw new Error('入场次数须为非负整数');
                    const value=Number(text);
                    if (!Number.isFinite(value)) throw new Error('登记标准须填写有限数值');
                    rules[field as keyof QuantCriteriaInput]=field==='minEntries'?value:value/100;
                }
                freezeCriteria(rules);
            }
            if(labelEnabled && (!/^\d+$/.test(horizon) || Number(horizon)<1 || Number(horizon)>2000 || Number(form.intervals)-Number(horizon)+1<5))throw new Error('标签期限须为1–2000根，剔除跨界起点后至少保留5对');
            const value=await quantValidations.register(collection,{...form,sourceRequestId:source,attemptId:attempt,intervals:Number(form.intervals),seconds:Number(form.seconds),requestKey:key.current,...(rules?{criteria:rules}:{}),
                ...(labelEnabled?{labelTarget:{version:1 as const,horizonBars:Number(horizon)}}:{})});
            saved(value.id);
        } catch(cause) {setError(quantError(cause));}
        finally {pending.current=false;setBusy(false);}
    };
    return {form,enabled,criteria,busy,error,submit,labelEnabled,horizon,
        toggleLabel:(value:boolean)=>{if(!pending.current && !inheritedLabel){changed();setLabelEnabled(value);}},
        updateHorizon:(value:string)=>{if(!pending.current){changed();setHorizon(value);}},
        update:(field:keyof typeof form,value:string)=>{if(!pending.current){changed();setForm(v=>({...v,[field]:value}));}},
        toggle:(value:boolean)=>{if(!pending.current){changed();setEnabled(value);}},
        updateCriterion:(field:keyof CriteriaForm,value:string)=>{if(!pending.current){changed();setCriteria(v=>({...v,[field]:value}));}}};
}
