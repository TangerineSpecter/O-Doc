import {useRef} from 'react';
import {Select} from '../../common/Select';
import {CodeEditor} from '../CodeEditor';
import {QuantButton, QuantField, QuantModal} from '../ui';
import {useQuantSourceSupplement} from '../../../hooks/useQuantSourceSupplement';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import type {QuantSource} from '../../../types/api/quant';
import type {QuantSourceSupplementResult} from '../../../types/api/quantSourceSupplement';

export function SourceSupplement({collection,entry,source,modelId,close,saved,register}: {
    collection:string;entry:string;source:QuantSource;modelId:string;close:()=>void;
    saved:(value:QuantSourceSupplementResult)=>Promise<void>;register:QuantRegisterDraft;
}) {
    const upload=useRef<HTMLInputElement>(null);
    const form=useQuantSourceSupplement(collection,entry,source.id,source.payload.language || 'text',modelId,saved);
    useQuantDraftRegistration('source-dependencies',form.dirty,form.save,register);
    const language=source.payload.language;
    return <QuantModal title="补充依赖源码" close={close} busy={form.busy} wide footer={<>
        <QuantButton disabled={form.busy} onClick={close}>取消</QuantButton>
        <QuantButton primary disabled={form.busy} onClick={()=>void form.save()}>{form.busy ? '正在保存…' : form.analyze ? '保存并交给 AI 分析' : '保存新来源版本'}</QuantButton>
    </>}>
        <fieldset disabled={form.busy} className="min-w-0 space-y-5">
            <p className="text-sm leading-7 text-slate-600">把缺失的函数或库源码贴进来。系统会保留主源码及旧报告，生成含依赖的新来源版本，再由 AI 核对计算、参数与未解决问题。</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">本次补交 {form.files.length}/4 份文件</p>
                <QuantButton disabled={form.busy} onClick={()=>upload.current?.click()}>上传源码文件</QuantButton>
                <input ref={upload} type="file" multiple accept=".py,.mq4,.mqh,.pine,.tdx,.txt" className="hidden" aria-label="上传依赖源码文件" onChange={event=>{void form.upload(event.target.files);event.target.value='';}}/>
            </div>
            <label className="block space-y-2 text-sm text-slate-600"><span>上传读取编码</span><Select menuPortal={true} value={form.encoding} onChange={form.setEncoding} options={[
                {value:'auto',label:'自动识别 UTF-8 / UTF-16'}, {value:'utf-8',label:'UTF-8'}, {value:'utf-16le',label:'UTF-16 LE'},
                {value:'utf-16be',label:'UTF-16 BE'}, {value:'gb18030',label:'GB18030 / GBK'},
            ]}/><span className="block text-xs leading-6 text-slate-500">上传后保存解码后的源码文本，文件校验和按 UTF-8 文本计算。</span></label>
            {form.files.length>1 && <label className="block space-y-2 text-sm text-slate-600"><span>正在编辑的依赖</span><Select menuPortal={true} value={String(form.selected)} onChange={value=>form.setSelected(Number(value))} options={form.files.map((file,index)=>({value:String(index),label:file.name || `第${index+1}份依赖`}))}/></label>}
            <div className="space-y-3">
                <QuantField label="依赖文件名（与源码引用一致）" value={form.files[form.selected].name} onChange={value=>form.update('name',value)} required/>
                <div><p className="mb-2 text-sm font-semibold text-slate-700">依赖源码</p><CodeEditor value={form.files[form.selected].code} onChange={value=>form.update('code',value)} readOnly={form.busy} compact language={language==='python' || language==='pine' || language==='mql4' || language==='tongdaxin' ? language : 'text'}/></div>
                <div className="flex justify-end"><QuantButton disabled={form.busy} onClick={form.remove}>移除此文件</QuantButton></div>
            </div>
            <QuantField label="补充原因或希望 AI 重点核对的问题" value={form.reason} onChange={form.setReason} multiline rows={3}/>
            <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={form.analyze} disabled={form.busy} onChange={event=>form.setAnalyze(event.target.checked)}/>保存后自动分析并生成新报告</label>
            <p className="text-xs leading-6 text-slate-500">同名依赖会以新版本替换，主源码保持原样。文件仅供分析；依赖是否实际解析、原平台编译与执行结果需要另行验证。</p>
            {form.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{form.error}</p>}
        </fieldset>
    </QuantModal>;
}
