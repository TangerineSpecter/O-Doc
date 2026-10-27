import {HttpResponse} from 'msw';
import type {QuantEntryDetail, QuantSource} from '../../types/api/quant';
import type {QuantSourceFile, QuantSourceSupplementInput} from '../../types/api/quantSourceSupplement';
import {quantModels} from './fixtures';
import {createRun} from './runs';
import {persistQuantState, quantState} from './state';
import {mockSourceHash, presentMockEntry, setMockMaterialCurrent} from './sourceSnapshots';

const fail=(status:number,msg:string)=>HttpResponse.json({code:status,msg,data:null},{status});
const hash=async(code:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))).map(value=>value.toString(16).padStart(2,'0')).join('');
const lines=(code:string)=>(code.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || []).filter(Boolean).length;
const normalized=(name:string)=>name.normalize('NFC').toLowerCase();

/** Fixture archive/queue lifecycle only; generated reports remain labelled local. */
export async function supplementMockSource(entry:QuantEntryDetail,sourceId:string,body:QuantSourceSupplementInput) {
    const source=entry.sources?.find(row=>row.id===sourceId);
    if (!source || source.payload.provenance==='external_feedback') return fail(404,'当前研究中不存在该源码来源');
    if (!body || typeof body.requestKey!=='string' || !/^[A-Za-z0-9_-]{16,64}$/.test(body.requestKey) || typeof body.reason!=='string' || !body.reason.trim() || body.reason.length>2000 || !Array.isArray(body.files) || body.files.length<1 || body.files.length>4) return fail(400,'请提交原因和1–4份依赖源码');
    const fingerprint=JSON.stringify(body),identity=`supplement-${source.materialId}-${body.requestKey}`;
    const old=entry.sources!.find(row=>row.id===identity);
    if (old) return old.payload.requestFingerprint===fingerprint && old.payload.parentSourceId===sourceId ? {entry:presentMockEntry(entry),sourceId:old.id,notice:''} : fail(409,'补充请求内容已发生变化');
    if (body.expectedSourceId!==sourceId || quantState().materialCurrentSources[source.materialId]!==sourceId) return fail(409,'来源已有新版本，请选择材料当前快照后补充');
    if (!source.payload.code?.trim()) return fail(400,'请先提供主源码');
    const depth=(source.payload.bundleDepth || 0)+1;
    if (depth>64) return fail(400,'依赖补充最多64层，请重新收集为独立研究');
    const names=new Set<string>();
    const extension=({python:'py',pine:'pine',mql4:'mq4',tongdaxin:'tdx'} as Record<string,string>)[source.payload.language || ''] || 'txt';
    const files:Pick<QuantSourceFile,'name'|'code'|'role'>[] = source.payload.files?.map(({name,code,role})=>({name,code,role})) || [{name:`__source__.${extension}`,code:source.payload.code,role:'primary'}];
    let changed=false;
    for (const file of body.files) {
        if (!file || typeof file.name!=='string' || !/^[\p{L}\p{N}\p{M}_./ -]{1,160}$/u.test(file.name) || file.name.split('/').some(part=>!part || part==='.' || part==='..' || part!==part.trim()) || !/\.(py|pine|mq4|mqh|tdx|txt|csv|tsv)$/i.test(file.name) || typeof file.code!=='string' || !file.code.trim() || file.code.length>100000 || file.code.includes('\0') || names.has(normalized(file.name))) return fail(400,'文件名或源码无效，不能使用越界路径或重复文件');
        if (/\.(csv|tsv)$/i.test(file.name) && source.payload.language!=='tongdaxin') return fail(400,'CSV/TSV参数表仅用于通达信来源');
        names.add(normalized(file.name));
        const existing=files.find(row=>normalized(row.name)===normalized(file.name));
        if (existing && (existing.role==='primary' || existing.name!==file.name)) return fail(400,'不能覆盖主源码；替换依赖须使用完全相同的文件名');
        if (existing?.code===file.code) continue;
        if (existing) files[files.indexOf(existing)]={...file,role:'dependency'};
        else files.push({...file,role:'dependency'});
        changed=true;
    }
    if (!changed || files.length>8) return fail(400,'依赖没有变化或文件总数超过8份');
    let line=1,code='';const saved:QuantSourceFile[]=[];
    for (const file of files) {
        const prefix=source.payload.language==='python' ? '#' : '//';
        const origin=file.role==='primary' ? 'from parent snapshot' : 'user supplied';
        const label=`SOURCE FILE: ${file.name} (${file.role}; ${origin}; not executed)`;
        const block=(source.payload.language==='tongdaxin' ? `{ ${label} }\n` : `${prefix} ${label}\n`)+file.code+'\n\n';
        saved.push({...file,contentHash:await hash(file.code),startLine:line+1,endLine:line+lines(file.code)});
        code+=block;line+=lines(block);
    }
    if (code.length>150000) return fail(400,'主源码与依赖合计超过150000字符');
    const created:QuantSource={id:identity,materialId:source.materialId,codeVersionId:null,createdAt:new Date().toISOString(),
        contentHash:`local-demo-bundle-${identity}`,payload:{...source.payload,code,bundleVersion:1,files:saved,
            bundleDepth:depth,provenance:'source_supplement',fetchStatus:'supplied',parentSourceId:source.id,parentSourceHash:mockSourceHash(source),requestFingerprint:fingerprint}};
    entry.sources!.unshift(created);setMockMaterialCurrent(created);
    let notice='';
    if (body.analyze!==false) {
        const modelId=body.modelId || quantModels.defaultModelId;
        if (!quantModels.models.some(row=>row.id===modelId)) notice='依赖已保存；请配置可用对话模型后再分析';
        else if (entry.runs.some(row=>['pending','running'].includes(row.status))) notice='依赖已保存；已有任务执行中，结束后可重新分析';
        else createRun(entry,{kind:'analyze',sourceId:created.id,requestKey:body.requestKey,modelId});
    }
    entry.updatedAt=created.createdAt;persistQuantState();
    return {entry:presentMockEntry(entry),sourceId:created.id,notice};
}
