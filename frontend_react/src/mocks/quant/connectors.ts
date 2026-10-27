import {HttpResponse} from 'msw';
import type {ConnectorConfig,ConnectorMapping,QuantConnector,QuantExternalResponse} from '../../types/api/quantStudy';
import {quantState,quantId,persistQuantState} from './state';
export interface MockConnector{collection:string;data:QuantConnector}
export interface MockConnectorResponse{collection:string;data:QuantExternalResponse}
const fail=(code:number,msg:string)=>HttpResponse.json({code,msg,data:null},{status:code});
const missing=Symbol('missing');
function path(value:unknown,source:string):unknown{
    if(source==='$'||source==='')return value;
    const keys=source.startsWith('/')?source.slice(1).split('/').map(k=>k.replace(/~1/g,'/').replace(/~0/g,'~')):[...source.matchAll(/\.([^.[\]]+)|\[(\d+)\]/g)].map(row=>row[1]||row[2]);
    for(const key of keys){if(value&&typeof value==='object'&&key in value)value=(value as Record<string,unknown>)[key];else return missing;}return value;
}
/** Computes only the user's JSON sample mapping. Never makes an HTTP request. */
export function mapLocalSample(value:unknown,rows:ConnectorMapping[]):{value:Record<string,unknown>;warnings:string[]}{
    const output:Record<string,unknown>=Object.create(null) as Record<string,unknown>,warnings:string[]=[];
    for(const row of rows){if(!row.target||!row.source)throw new Error('请填写目标和来源路径');let result=path(value,row.source);
        if(result===missing||result===null){if(row.required)throw new Error('响应缺少必需字段：'+row.source);result=null;warnings.push('未提供字段：'+row.source);}
        else if(row.type==='number'){if(typeof result==='boolean'||typeof result==='string'&&!result.trim()||!Number.isFinite(Number(result)))throw new Error('数值字段无法解析：'+row.source);result=Number(result)*(row.scale??1);}
        else if(row.type==='string'&&typeof result!=='string')result=JSON.stringify(result);
        else if(row.type==='boolean'){if(![true,false,'true','false'].includes(result as boolean|string))throw new Error('布尔字段须为true/false');result=result===true||result==='true';}
        else if(row.type==='array'){if(!Array.isArray(result))throw new Error('数组字段类型不符');result=result.map(item=>row.fields?.length?mapLocalSample(item,row.fields).value:item);}
        const keys=row.target.split('.');let at=output;for(const key of keys.slice(0,-1)){at[key]??={};at=at[key] as Record<string,unknown>;}at[keys[keys.length-1]]=result;
    }return{value:output,warnings};
}
export async function resolveConnectorRoute(request:Request,collection:string,id?:string,action?:string){
    const state=quantState(),records=state.connectors.filter(r=>r.collection===collection),record=records.find(r=>r.data.id===id);
    if(request.method==='GET'){if(action==='responses')return{items:state.connectorResponses.filter(r=>r.collection===collection).map(r=>r.data)};return id?record?.data||fail(404,'连接器不存在'):{items:records.map(r=>r.data)};}
    if(request.method!=='POST')return fail(405,'不支持此操作');
    try{const body=await request.json() as {name?:string;configJson?:string;secretsJson?:string;responseJson?:string;contextJson?:string};
        if(action==='preview'){
            const cfg=JSON.parse(body.configJson||record?.data.configJson||'{}') as ConnectorConfig;
            const response:unknown=JSON.parse(body.responseJson||'{}'),mapped=mapLocalSample(response,cfg.mappings);
            state.connectorSamples[JSON.stringify(cfg)]=response;persistQuantState();
            return{normalizedJson:JSON.stringify(mapped.value),warnings:mapped.warnings,evidenceStatus:'external_report_unverified',requestTemplateJson:JSON.stringify(cfg)};
        }
        if(action==='execute'){
            if(!record)return fail(404,'连接器不存在');const cfg=JSON.parse(record.data.configJson) as ConnectorConfig;
            const sample=state.connectorSamples[JSON.stringify(cfg)]||{data:{totalReturn:.12,parameters:{N:20},conclusion:'人工响应样例'}};
            const mapped=mapLocalSample(sample,cfg.mappings);
            const data:QuantExternalResponse={id:quantId('external-response'),connectorId:record.data.id,createdAt:new Date().toISOString(),dataJson:JSON.stringify({version:1,local_demo:true,raw_response:sample,normalized:mapped.value,warnings:mapped.warnings,evidence_status:'external_report_unverified',note:'人工local响应，没有发送任何HTTP请求'})};
            state.connectorResponses.unshift({collection,data});persistQuantState();return data;
        }
        const cfg=JSON.parse(body.configJson||'{}') as ConnectorConfig;if(cfg.version!==1||!/^https?:\/\//i.test(cfg.url)||!Array.isArray(cfg.mappings)||!body.name?.trim())return fail(400,'连接配置无效');
        if(id&&!record)return fail(404,'连接器不存在');const data:QuantConnector={id:id||quantId('connector'),name:body.name,configJson:JSON.stringify(cfg),hasSecrets:body.secretsJson?Object.keys(JSON.parse(body.secretsJson)).length>0:record?.data.hasSecrets||false,updatedAt:new Date().toISOString()};
        // Only a boolean is persisted in local mocks; entered credentials are discarded.
        if(record)record.data=data;else state.connectors.unshift({collection,data});persistQuantState();return data;
    }catch(cause){return fail(400,cause instanceof Error?cause.message:'JSON或映射无效');}
}
