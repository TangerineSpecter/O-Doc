import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {resolveQuantRoute} from './routes.ts';
import {quantState,resetQuantStateForTests} from './state.ts';
import {mockReportBody} from './reading.ts';
import type {QuantDirectory,QuantEntryOverview,QuantPage,QuantReportHeader,QuantReportReading,QuantSourceHeader,QuantStatus} from '../../types/api/quantReading.ts';
Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=sample'),configurable:true});
beforeEach(()=>resetQuantStateForTests());
const base='/api/quant/local-quant/entries/';
const get=async<T>(path:string)=>await resolveQuantRoute(new Request('http://localhost'+base+path,{headers:{Authorization:'Token local-demo-token'}})) as T;
test('directory applies whole-library search before paging and returns no bodies',async()=>{
    const state=quantState(),template=state.entries[0];
    for(let i=0;i<100;i++)state.entries.push({...structuredClone(template),id:`large-${i}`,title:`样例${i}`,content:`远端关键词${i} `+'长'.repeat(10000)});
    const page=await get<QuantDirectory>('');assert.equal(page.items.length,50);assert.ok(page.hasMore);
    assert.ok(page.items.every(row=>row.preview.length<=160&&!('content'in row)&&!('reports'in row)));
    const found=await get<QuantDirectory>('?q=远端关键词99');assert.equal(found.total,1);assert.equal(found.items[0].id,'large-99');
    assert.equal((await get<Response>('?limit=101')).status,400);
});
test('overview, report headers and selected body are distinct, original/history load separately',async()=>{
    const overview=await get<QuantEntryOverview>('local-momentum/');
    assert.ok(overview.defaultReportId);assert.ok(!('reports'in overview)&&!('content'in overview));
    const page=await get<QuantPage<QuantReportHeader>>('local-momentum/reading/reports/');
    assert.ok(page.items.length);assert.ok(!('markdown'in page.items[0]));
    const body=await get<QuantReportReading>(`local-momentum/reading/reports/${overview.defaultReportId}/`);
    assert.ok(body.markdown);assert.ok(!('originalMarkdown'in body)&&!('revisions'in body));
    const sources=await get<QuantPage<QuantSourceHeader>>('local-momentum/reading/sources/');
    assert.ok(sources.items.every(row=>!('payload'in row)));
    const state=await get<QuantStatus>('local-momentum/status/');assert.ok(!JSON.stringify(state).includes('originalMarkdown'));
    assert.ok(state.activeRuns.every(run=>!('result'in run)));
    assert.equal((await get<Response>('local-momentum/reading/reports/not-owned/')).status,404);
    const original=await get<{markdown:string}>(`local-momentum/reading/reports/${overview.defaultReportId}/original/`);assert.ok(original.markdown);
    const fixture=quantState().entries.find(row=>row.id==='local-momentum')!.reports![0];
    assert.equal(mockReportBody(fixture).revisionCount,fixture.revisions.length);
});

test('source/version metadata and mutation receipts never include historical bodies',async()=>{
    await get<QuantEntryOverview>('local-momentum/');
    const create=await resolveQuantRoute(new Request('http://localhost'+base+'local-momentum/implementations/',{
        method:'POST',headers:{Authorization:'Token local-demo-token','Content-Type':'application/json'},
        body:JSON.stringify({name:'读取回归实现',language:'python',code:'value = 1'})
    })) as {id:string;currentVersionId:string};
    assert.ok(create.id);assert.ok(!('versions' in create));
    const versions=await get<QuantPage<{id:string}>>(`local-momentum/reading/implementations/${create.id}/versions/`);
    assert.ok(versions.items.length);assert.ok(!('code'in versions.items[0]));
    const source=await get<QuantPage<QuantSourceHeader>>('local-momentum/reading/sources/');
    const metadata=await get<QuantSourceHeader>(`local-momentum/reading/sources/${source.items[0].id}/?metadata=1`);
    assert.ok(!('payload'in metadata));
    const entry=quantState().entries.find(row=>row.id==='local-momentum')!;
    const run=entry.runs[0];run.status='running';
    const stopped=await resolveQuantRoute(new Request('http://localhost'+base+`local-momentum/runs/${run.id}/cancel/`,{method:'POST',headers:{Authorization:'Token local-demo-token'}})) as object;
    assert.ok(!('result'in stopped));
});
