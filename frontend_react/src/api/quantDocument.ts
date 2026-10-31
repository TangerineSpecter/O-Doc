import request from '../utils/request';
import type {QuantDocument, DocumentOperation} from '../types/api/quantDocument';
const url=(collection:string,entry:string)=>`/quant/${encodeURIComponent(collection)}/entries/${encodeURIComponent(entry)}/document/`;
export const quantDocumentApi={
    get:(collection:string,entry:string,params:{compareId?:string;historyId?:string}={},signal?:AbortSignal)=>request.get<never,QuantDocument>(url(collection,entry),{params,signal}),
    change:(collection:string,entry:string,data:DocumentOperation)=>request.post<never,QuantDocument>(url(collection,entry),data),
};
