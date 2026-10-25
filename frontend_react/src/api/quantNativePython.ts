import request from '../utils/request';
import type {NativeOptions,NativePythonInput,NativePythonRecord} from '../types/api/quantNativePython';
const base=(collection:string)=>`/quant/${encodeURIComponent(collection)}/`;
const factor=(collection:string,candidate:string)=>`${base(collection)}factors/${encodeURIComponent(candidate)}/native-python/`;
export const nativePythonApi={
    options:(collection:string,candidate:string,signal?:AbortSignal)=>request.get<never,NativeOptions>(factor(collection,candidate)+'options/',{signal,timeout:20000}),
    list:(collection:string,candidate:string,signal?:AbortSignal)=>request.get<never,{total:number;items:NativePythonRecord[]}>(factor(collection,candidate),{signal}),
    start:(collection:string,candidate:string,input:NativePythonInput)=>request.post<never,NativePythonRecord>(factor(collection,candidate),input,{timeout:20000}),
    detail:(collection:string,id:string,signal?:AbortSignal)=>request.get<never,NativePythonRecord>(`${base(collection)}native-python/${encodeURIComponent(id)}/`,{signal}),
    cancel:(collection:string,id:string)=>request.post<never,NativePythonRecord>(`${base(collection)}native-python/${encodeURIComponent(id)}/cancel/`),
};
