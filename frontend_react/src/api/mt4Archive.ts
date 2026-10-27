import request from '../utils/request';
import type {MT4Attachment, MT4Expert, MT4ExpertDetail, MT4ExpertInput, MT4Preview, MT4Test, MT4TestDetail, MT4Report} from '../types/api/mt4Archive';

const base = (coll: string) => `/quant/${encodeURIComponent(coll)}/mt4/experts/`;
const expert = (coll: string, id: string) => `${base(coll)}${encodeURIComponent(id)}/`;
const test = (coll: string, id: string, testId: string) => `${expert(coll, id)}tests/${encodeURIComponent(testId)}/`;
export const mt4Api = {
    experts: (coll: string) => request.get<never, MT4Expert[]>(base(coll)),
    expert: (coll: string, id: string) => request.get<never, MT4ExpertDetail>(expert(coll, id)),
    createExpert: (coll: string, data: MT4ExpertInput) => request.post<never, MT4Expert>(base(coll), data),
    updateExpert: (coll: string, id: string, data: MT4ExpertInput) => request.patch<never, MT4Expert>(expert(coll, id), data),
    deleteExpert: (coll: string, id: string) => request.delete<never, void>(expert(coll, id)),
    preview: (coll: string, id: string, assetId: string) => request.post<never, MT4Preview>(`${expert(coll, id)}preview/`, {assetId}, {timeout: 60000}),
    recognize: (coll: string, id: string, assetId: string) => request.post<never, {metrics: {name: string; value: string}[]; modelName: string}>(`${expert(coll, id)}recognize/`, {assetId}, {timeout: 65000}),
    createTest: (coll: string, id: string, data: {title: string; description: string; conclusion: string; data: MT4Report; reportAssetId?: string; imageAssetId?: string; allowDuplicate?: boolean}) => request.post<never, MT4Test>(`${expert(coll, id)}tests/`, data, {timeout: 60000}),
    updateTest: (coll: string, id: string, testId: string, data: Partial<MT4Test>) => request.patch<never, MT4Test>(test(coll, id, testId), data),
    test: (coll: string, id: string, testId: string) => request.get<never, MT4TestDetail>(test(coll, id, testId)),
    deleteTest: (coll: string, id: string, testId: string) => request.delete<never, void>(test(coll, id, testId)),
    attach: (coll: string, id: string, testId: string | null, assetId: string, role: string) => request.post<never, MT4Attachment>(`${testId ? test(coll, id, testId) : expert(coll, id)}attachments/`, {assetId, role}),
    removeAttachment: (coll: string, id: string, testId: string | null, refId: string) => request.delete<never, void>(`${testId ? test(coll, id, testId) : expert(coll, id)}attachments/${encodeURIComponent(refId)}/`),
    zipChart: (coll: string, id: string, testId: string) => request.get<never, Blob>(`${test(coll, id, testId)}zip-chart/`, {responseType: 'blob'}),
};
