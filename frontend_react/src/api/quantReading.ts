import request from '../utils/request';
import type {QuantEntry, QuantSource, QuantCodeVersion, QuantBacktest, QuantAttachment} from '../types/api/quant';
import type {QuantDirectory, QuantEntryOverview, QuantReportHeader, QuantReportReading, QuantRevisionHeader, QuantTextBody,
    QuantSourceHeader, QuantRunSummary, QuantImplementationHeader, QuantImplementationReading, QuantVersionHeader, QuantStatus, QuantPage} from '../types/api/quantReading';
const root = (c: string, e: string) => `/quant/${encodeURIComponent(c)}/entries/${encodeURIComponent(e)}/`;
const read = <T>(c: string, e: string, path: string, signal?: AbortSignal, params?: object) => request.get<never,T>(`${root(c,e)}reading/${path}`,{signal, params});
export interface QuantDirectoryQuery {q: string; kind: string; language: string; sort: 'updated'|'title'}
export const quantReadingApi = {
    directory: (c: string, query: QuantDirectoryQuery, offset=0, signal?: AbortSignal) => request.get<never,QuantDirectory>(`/quant/${encodeURIComponent(c)}/entries/`,{params:{...query,offset,limit:50},signal}),
    overview: (c: string,e: string,signal?: AbortSignal) => request.get<never,QuantEntryOverview>(root(c,e),{signal}),
    status: (c: string,e: string,signal?: AbortSignal) => request.get<never,QuantStatus>(`${root(c,e)}status/`,{signal}),
    notes: (c:string,e:string,signal?:AbortSignal) => read<QuantEntry>(c,e,'notes/',signal),
    reports: (c:string,e:string,offset=0,signal?:AbortSignal) => read<QuantPage<QuantReportHeader>>(c,e,'reports/',signal,{offset,limit:20}),
    report: (c:string,e:string,id:string,signal?:AbortSignal) => read<QuantReportReading>(c,e,`reports/${encodeURIComponent(id)}/`,signal),
    original: (c:string,e:string,id:string,signal?:AbortSignal) => read<QuantTextBody>(c,e,`reports/${encodeURIComponent(id)}/original/`,signal),
    revisions: (c:string,e:string,id:string,offset=0,signal?:AbortSignal) => read<QuantPage<QuantRevisionHeader>>(c,e,`reports/${encodeURIComponent(id)}/revisions/`,signal,{offset,limit:20}),
    revision: (c:string,e:string,id:string,revision:string,signal?:AbortSignal) => read<QuantTextBody>(c,e,`reports/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revision)}/`,signal),
    sources: (c:string,e:string,offset=0,signal?:AbortSignal) => read<QuantPage<QuantSourceHeader>>(c,e,'sources/',signal,{offset,limit:20}),
    feedbackSources: (c:string,e:string,offset=0,signal?:AbortSignal) => read<QuantPage<QuantSourceHeader>>(c,e,'sources/',signal,{offset,limit:20,provenance:'external_feedback'}),
    sourceHeader: (c:string,e:string,id:string,signal?:AbortSignal) => read<QuantSourceHeader>(c,e,`sources/${encodeURIComponent(id)}/`,signal,{metadata:1}),
    source: (c:string,e:string,id:string,signal?:AbortSignal) => read<QuantSource>(c,e,`sources/${encodeURIComponent(id)}/`,signal),
    implementations: (c:string,e:string,offset=0,signal?:AbortSignal) => read<QuantPage<QuantImplementationHeader>>(c,e,'implementations/',signal,{offset,limit:20}),
    implementationHeader: (c:string,e:string,id:string,signal?:AbortSignal) => read<QuantImplementationHeader>(c,e,`implementations/${encodeURIComponent(id)}/`,signal,{metadata:1}),
    implementation: (c:string,e:string,id:string,signal?:AbortSignal) => read<QuantImplementationReading>(c,e,`implementations/${encodeURIComponent(id)}/`,signal),
    versions: (c:string,e:string,id:string,offset=0,signal?:AbortSignal) => read<QuantPage<QuantVersionHeader>>(c,e,`implementations/${encodeURIComponent(id)}/versions/`,signal,{offset,limit:20}),
    versionHeader: (c:string,e:string,id:string,signal?:AbortSignal) => read<QuantVersionHeader>(c,e,`versions/${encodeURIComponent(id)}/`,signal,{metadata:1}),
    version: (c:string,e:string,id:string,signal?:AbortSignal) => read<QuantCodeVersion>(c,e,`versions/${encodeURIComponent(id)}/`,signal),
    runs: (c:string,e:string,offset=0,signal?:AbortSignal) => read<QuantPage<QuantRunSummary>>(c,e,'runs/',signal,{offset,limit:20}),
    run: (c:string,e:string,id:string,signal?:AbortSignal) => read<QuantRunSummary>(c,e,`runs/${encodeURIComponent(id)}/`,signal),
    backtests: (c:string,e:string,offset=0,signal?:AbortSignal) => read<QuantPage<QuantBacktest>>(c,e,'backtests/',signal,{offset,limit:20}),
    attachments: (c:string,e:string,offset=0,signal?:AbortSignal) => read<QuantPage<QuantAttachment>>(c,e,'attachments/',signal,{offset,limit:20}),
};
