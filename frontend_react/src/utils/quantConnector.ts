import type {ConnectorConfig,ConnectorMapping} from '../types/api/quantStudy';
export const connectorExample:ConnectorConfig={version:1,method:'POST',url:'http://127.0.0.1:8600/backtest',timeout:20,headers:{'Content-Type':'application/json'},query:{},body:{factor:'{{factor}}',parameters:'{{parameters}}'},mappings:[{target:'metrics.total_return',source:'$.data.totalReturn',type:'number',required:true},{target:'parameters',source:'$.data.parameters',type:'json'},{target:'conclusion',source:'$.data.conclusion',type:'string'}]};
export interface ConnectorDraft {method:ConnectorConfig['method'];url:string;timeout:string;headers:string;query:string;body:string;mappings:ConnectorMapping[]}
export const connectorDraft=(value:ConnectorConfig):ConnectorDraft=>({method:value.method,url:value.url,timeout:String(value.timeout),headers:JSON.stringify(value.headers,null,2),query:JSON.stringify(value.query,null,2),body:JSON.stringify(value.body,null,2),mappings:structuredClone(value.mappings)});
export function buildConnector(value:ConnectorDraft):ConnectorConfig{
    const headers:unknown=JSON.parse(value.headers),query:unknown=JSON.parse(value.query);
    if(!headers||Array.isArray(headers)||typeof headers!=='object'||!query||Array.isArray(query)||typeof query!=='object')throw new Error('请求头与查询参数须为JSON对象');
    if(!Number.isInteger(Number(value.timeout))||Number(value.timeout)<1||Number(value.timeout)>30)throw new Error('请求超时须为1–30秒');
    return{version:1,method:value.method,url:value.url,timeout:Number(value.timeout),headers:headers as Record<string,unknown>,query:query as Record<string,unknown>,body:JSON.parse(value.body),mappings:value.mappings};
}
