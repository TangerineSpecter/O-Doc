import {readNativeAlignment} from '../../../utils/quantNativeAlignment';
import type {NativeAlignmentAck} from '../../../types/api/quantNativeReview';
export function NativeAlignment({json}:{json:string}) {
    let data:NativeAlignmentAck;
    try{data=readNativeAlignment(json);}catch{return <p role="alert" className="text-xs text-red-600">程序位置摘要暂无法读取，可查看固定输入原件。</p>;}
    return <section className="space-y-2 text-sm" aria-label="程序核算的位置"><h6 className="font-medium text-slate-800">程序核算的位置</h6>
        {data.status==='unavailable'?<p>原函数未得到完整输出，位置保持未知。</p>:<>
            <p className="text-xs text-slate-500">行号从固定片段0开始，有效行按整个片段统计；比较从行{data.compared_start_index}开始，共{data.sample_row_count-data.compared_start_index}行。</p>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1"><dt>受控表达式首次有效行</dt><dd className="text-right tabular-nums">{data.left_first_valid_index??'无有效行'}</dd><dt>原始函数首次有效行</dt><dd className="text-right tabular-nums">{data.right_first_valid_index??'无有效行'}</dd></dl>
            <p className="break-words">缺失不一致共{data.missing_mismatch_total}行{data.missing_mismatch_indices.length?`，行号：${data.missing_mismatch_indices.join('、')}`:'。'}{data.omitted_missing_mismatches?`；另有${data.omitted_missing_mismatches}行未在摘要展开。`:''}</p>
        </>}
    </section>;
}
