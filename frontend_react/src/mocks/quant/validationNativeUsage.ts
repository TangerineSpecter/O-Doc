/** Artificial native-use projection; never runs Python or proves independence. */
import type {QuantValidationAudit} from '../../types/api/quantValidation';
import {mockDatasetTimestamp,type MockDataset} from './datasets';
import {quantState} from './state';

export function mockNativeUsage(collection:string,target:MockDataset,start:string,end:string) {
    const conflicts:QuantValidationAudit['conflicts']=[];
    const records=quantState().nativePython.filter(row=>row.collection===collection);
    let complete=records.length<=1000;
    for (const record of records.slice(0,1000)) {
        try {
            const plan=JSON.parse(record.data.planJson || 'null') as {dataset?:{id?:string;offset?:number;row_count?:number}}|null;
            const sample=plan?.dataset;
            const data=quantState().datasets.find(row=>row.collection===collection && row.data.id===sample?.id);
            const offset=sample?.offset,count=sample?.row_count;
            if (!data || typeof offset!=='number' || !Number.isInteger(offset) || offset<0 || typeof count!=='number' || !Number.isInteger(count) || count<30 || count>20000 || offset+count>data.data.rowCount) {complete=false;continue;}
            const first=mockDatasetTimestamp(data,offset),last=mockDatasetTimestamp(data,offset+count-1);
            if (data.data.symbol===target.data.symbol && data.data.timeframe===target.data.timeframe && Date.parse(first)<=Date.parse(end) && Date.parse(last)>=Date.parse(start)) conflicts.push({
                key:`native_python:${record.data.id}`,kind:'native_python',start:first,end:last,collection_id:collection,
                reason:'overlapping_exact_market',native_sample:{offset,row_count:count,scope:'all_supplied_rows_including_warmup'}});
        } catch {complete=false;}
    }
    return {conflicts,complete};
}
