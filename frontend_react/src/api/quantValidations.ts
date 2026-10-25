import request from '../utils/request';
import type {QuantValidation,QuantValidationInput,QuantValidationSummary} from '../types/api/quantValidation';
const base=(collection: string) => `/quant/${encodeURIComponent(collection)}/validations/`;
export const quantValidations = {
    list: (collection: string, sourceRequestId: string, offset: number, signal?: AbortSignal) => request.get<never,{total: number;items: QuantValidationSummary[]}>(base(collection),{params:{sourceRequestId,offset},signal}),
    detail: (collection: string,id: string,signal?: AbortSignal) => request.get<never,QuantValidation>(`${base(collection)}${encodeURIComponent(id)}/`,{signal}),
    register: (collection: string,data: QuantValidationInput) => request.post<never,QuantValidation>(base(collection),data),
    preview: (collection: string,id: string,datasetId: string,signal?: AbortSignal) => request.post<never,{previewJson: string}>(`${base(collection)}${encodeURIComponent(id)}/preview/`,{datasetId},{signal}),
    run: (collection: string,id: string,datasetId: string,mode: 'fresh'|'replication') => request.post<never,QuantValidation>(`${base(collection)}${encodeURIComponent(id)}/run/`,{datasetId,mode}),
    cancel: (collection: string,id: string) => request.post<never,QuantValidation>(`${base(collection)}${encodeURIComponent(id)}/cancel/`),
    review: (collection: string,id: string,requestKey: string) => request.post<never,QuantValidation>(`${base(collection)}${encodeURIComponent(id)}/review/`,{requestKey}),
};
