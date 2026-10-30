/** Domain-fixture tests inspect complete in-memory research facts. HTTP reading
 * contract tests must import routes.ts directly. This adapter is never a route
 * or a production fallback: it lets old domain assertions keep testing stored
 * model results independently of the newly paginated browsing wire format. */
import {resolveQuantRoute} from './routes';
import {quantState} from './state';
import {presentMockEntry} from './sourceSnapshots';
export async function resolveQuantFixtureRequest(request:Request):Promise<unknown> {
    const initialPath=new URL(request.url).pathname.split('/').filter(Boolean);
    if(request.method==='GET'&&initialPath[5]==='runs'&&initialPath[6]){
        const statusUrl=new URL(`/api/quant/${initialPath[2]}/entries/${initialPath[4]}/status/`,request.url);
        await resolveQuantRoute(new Request(statusUrl,{headers:request.headers}));
    }
    const result=await resolveQuantRoute(request);
    if(result instanceof Response)return result;
    const path=new URL(request.url).pathname.split('/').filter(Boolean);
    const entryId=path[4],section=path[5],identity=path[6];
    const state=quantState();
    const entry=state.entries.find(row=>row.id===entryId&&row.collId===path[2]);
    if(request.method==='GET'&&entry&&!section){
        await resolveQuantRoute(new Request(request.url.replace(/\/$/,'')+'/status/',{headers:request.headers}));
        return presentMockEntry(entry);
    }
    if(result&&typeof result==='object'&&'entry' in result){
        const receipt=result as {entry:{id:string}};
        const row=state.entries.find(row=>row.id===receipt.entry.id);
        if(row)return {...result,entry:presentMockEntry(row)};
    }
    if(section==='runs'&&path[7]==='adopt'&&result&&typeof result==='object'&&'implementation' in result){
        const impl=entry?.implementations.find(row=>row.id===(result as {implementation:{id:string}}).implementation.id);
        if(impl)return {...result,implementation:impl};
    }
    if(section==='implementations'&&result&&typeof result==='object'&&'id' in result) {
        const impl=entry?.implementations.find(row=>row.id===(result as {id:string}).id);
        if(impl)return impl;
    }
    if(request.method==='PATCH'&&section==='reports'&&entry)return entry.reports?.find(row=>row.id===identity)||result;
    if(request.method==='GET'&&path.length===4&&path[3]==='entries'&&result&&typeof result==='object'&&'items' in result)return (result as {items:unknown[]}).items;
    return result;
}
