import type {NativeAlignmentAck} from '../types/api/quantNativeReview';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function readNativeAlignment(text:string):NativeAlignmentAck {
    if(text.length>12000)throw new Error('位置摘要超过读取上限');
    const value:unknown=JSON.parse(text);
    if(!object(value)||value.method!=='fixed-output-missing-alignment-v1'||!['available','unavailable'].includes(String(value.status)))throw new Error('位置摘要版本无效');
    const size=value.sample_row_count,start=value.compared_start_index,indices=value.missing_mismatch_indices;
    if(typeof size!=='number'||!Number.isInteger(size)||size<30||size>20000||typeof start!=='number'||!Number.isInteger(start)||start<0||start>=size
        ||[value.left_first_valid_index,value.right_first_valid_index].some(v=>v!==null&&(typeof v!=='number'||!Number.isInteger(v)||v<0||v>=size))
        ||!Array.isArray(indices)||indices.length>12||indices.some(v=>typeof v!=='number'||!Number.isInteger(v)||v<start||v>=size)||indices.some((v,i)=>i>0&&v<=indices[i-1]))throw new Error('位置摘要行号无效');
    const total=value.missing_mismatch_total,omitted=value.omitted_missing_mismatches;
    if(value.status==='unavailable'){
        if([value.left_first_valid_index,value.right_first_valid_index,total,omitted].some(v=>v!==null)||indices.length)throw new Error('未知位置不能填零');
    }else if(typeof total!=='number'||!Number.isInteger(total)||total<0||total>size-start||typeof omitted!=='number'||!Number.isInteger(omitted)||omitted<0||indices.length+omitted!==total)throw new Error('缺失位置数量不一致');
    return value as unknown as NativeAlignmentAck;
}
