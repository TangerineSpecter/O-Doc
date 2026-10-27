import {useRef, useState} from 'react';
import {quantApi} from '../api/quant';
import {quantError} from '../utils/quant';
import {createRequestKey} from '../utils/requestKey';
import {decodeSourceFile} from '../utils/quantIntake';
import type {QuantSourceSupplementResult} from '../types/api/quantSourceSupplement';

export function useQuantSourceSupplement(collection: string, entry: string, source: string, language: string,
    modelId: string, saved: (result: QuantSourceSupplementResult) => Promise<void>) {
    const extension = ({python:'py',pine:'pine',mql4:'mqh',tongdaxin:'tdx'} as Record<string,string>)[language] || 'txt';
    const initialReason = '补充缺失依赖源码，请重新分析其计算、参数与仍未解决的问题。';
    const [files,setFiles] = useState([{name:`dependency.${extension}`,code:''}]);
    const [selected,setSelected] = useState(0);
    const [reason,setReason] = useState(initialReason);
    const [analyze,setAnalyze] = useState(true);
    const [encoding,setEncoding] = useState('auto');
    const [error,setError] = useState('');
    const [busy,setBusy] = useState(false);
    const pending = useRef(false);
    const key = useRef(createRequestKey());
    const changed = () => {key.current=createRequestKey();setError('');};
    const update = (field: 'name' | 'code', value: string) => {
        if (pending.current) return;
        changed();setFiles(rows=>rows.map((row,index)=>index===selected ? {...row,[field]:value} : row));
    };
    const upload = async (input: FileList | null) => {
        if (!input?.length || pending.current) return;
        pending.current=true;setBusy(true);setError('');
        try {
            const existing = files.filter(row=>row.code.trim());
            if (existing.length+input.length>4) throw new Error('每次最多补交4份依赖文件');
            const added = await Promise.all(Array.from(input).map(async file=>{
                if (file.size>400000) throw new Error('单份依赖文件过大，请保留本次研究需要的源码');
                const code=decodeSourceFile(await file.arrayBuffer(),file.name,encoding,language==='tongdaxin').code;
                if (!code.trim() || code.length>100000 || code.includes('\0')) throw new Error('依赖源码需为非空文本，单份不超过100000字符');
                return {name:file.name,code};
            }));
            changed();setFiles([...existing,...added]);setSelected(existing.length);
        } catch (failure) {setError(quantError(failure));}
        finally {pending.current=false;setBusy(false);}
    };
    const remove = () => {
        if (pending.current) return;
        changed();setFiles(rows=>rows.length===1 ? [{name:`dependency.${extension}`,code:''}] : rows.filter((_,index)=>index!==selected));setSelected(0);
    };
    const save = async () => {
        if (pending.current) return false;
        if (!reason.trim() || files.some(row=>!row.name.trim() || !row.code.trim())) {setError('请填写补充原因、文件名和源码');return false;}
        pending.current=true;setBusy(true);setError('');
        try {
            const result=await quantApi.supplementSource(collection,entry,source,{requestKey:key.current,
                expectedSourceId:source,reason,files,analyze,modelId});
            await saved(result);return true;
        } catch (failure) {setError(quantError(failure));return false;}
        finally {pending.current=false;setBusy(false);}
    };
    return {files,selected,setSelected,reason,analyze,encoding,setEncoding,error,busy,update,upload,remove,save,
        dirty:files.some(row=>!!row.code) || reason!==initialReason,
        setReason:(value:string)=>{changed();setReason(value);},setAnalyze:(value:boolean)=>{changed();setAnalyze(value);}};
}
