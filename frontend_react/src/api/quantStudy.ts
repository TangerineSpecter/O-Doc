import request from '../utils/request';
import type {QuantStudy, QuantStudyInput, QuantConnector, QuantConnectorInput, QuantConnectorPreview, QuantExternalResponse} from '../types/api/quantStudy';
const base = (collection: string) => `/quant/${encodeURIComponent(collection)}/`;
export const quantStudyApi = {
    list: (collection: string, signal?: AbortSignal) => request.get<never,{items: QuantStudy[]; total: number}>(base(collection)+'ai-studies/',{signal}),
    start: (collection: string, data: QuantStudyInput) => request.post<never,QuantStudy>(base(collection)+'ai-studies/',data),
    control: (collection: string, id: string, action: 'cancel'|'resume') => request.post<never,QuantStudy>(base(collection)+`ai-studies/${encodeURIComponent(id)}/${action}/`),
    revise: (collection:string,id:string,markdown:string)=>request.post<never,QuantStudy>(base(collection)+`ai-studies/${encodeURIComponent(id)}/report/`,{markdown}),
    connectors: (collection: string, signal?: AbortSignal) => request.get<never,{items: QuantConnector[]}>(base(collection)+'connectors/',{signal}),
    saveConnector: (collection: string, id: string|undefined, data: QuantConnectorInput) => request.post<never,QuantConnector>(base(collection)+`connectors/${id?encodeURIComponent(id)+'/':''}`,data),
    preview: (collection: string, data: {configJson: string; responseJson: string; contextJson: string}) => request.post<never,QuantConnectorPreview>(base(collection)+'connector-preview/',data),
    execute: (collection: string, id: string, contextJson: string) => request.post<never,QuantExternalResponse>(base(collection)+`connectors/${encodeURIComponent(id)}/execute/`,{contextJson},{timeout: 35000}),
    responses: (collection: string, signal?: AbortSignal) => request.get<never,{items: QuantExternalResponse[]}>(base(collection)+'connector-responses/',{signal}),
};
