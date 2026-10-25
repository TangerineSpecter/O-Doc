import {useState} from 'react';
import {Select} from '../../common/Select';
import {CodeEditor} from '../CodeEditor';
import type {QuantSource} from '../../../types/api/quant';

export function SourceBundlePreview({source}: {source:QuantSource}) {
    const files=source.payload.files || [];
    const [selected,setSelected]=useState('0');
    const file=files[Number(selected)] || files[0];
    if (!file) return null;
    const language=source.payload.language;
    return <div className="space-y-3">
        <p className="text-sm text-slate-600">主源码及补交依赖，共 {files.length} 份。原始文件保留；报告引文使用本快照的全局行号。</p>
        <Select value={selected} onChange={setSelected} options={files.map((row,index)=>({value:String(index),label:row.role==='primary' ? '主源码（原始快照）' : row.name}))}/>
        <p className="break-all text-xs text-slate-500">{file.role==='primary' ? '主源码' : file.name} · 全局行 {file.startLine}–{file.endLine} · {file.role==='primary' ? '沿用原始来源' : '用户提供'}</p>
        <CodeEditor key={file.name} value={file.code} readOnly compact firstLine={file.startLine} language={language==='python' || language==='mql4' || language==='pine' || language==='tongdaxin' ? language : 'text'}/>
        <details className="text-xs text-slate-500"><summary>文件版本依据</summary><p className="mt-2 break-all">文件：{file.name}<br/>源码文本 SHA-256：{file.contentHash}<br/>已归档来源，不代表原平台依赖安装或语义等价验证。</p></details>
    </div>;
}
