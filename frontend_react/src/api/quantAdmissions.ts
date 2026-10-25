import request from '../utils/request';
import type {AdmissionPage,AdmissionProgress} from '../types/api/quantAdmission';
const path=(collection:string,candidate:string)=>`/quant/${encodeURIComponent(collection)}/factors/${encodeURIComponent(candidate)}/admissions/`;
export const quantAdmissions={
    read:(collection:string,candidate:string,offset:number,signal?:AbortSignal)=>request.get<never,AdmissionPage>(path(collection,candidate),{params:{offset,limit:20},signal}),
    index:(collection:string,candidate:string,offset:number,signal?:AbortSignal)=>request.post<never,AdmissionProgress>(path(collection,candidate),{offset,limit:20},{signal}),
};
