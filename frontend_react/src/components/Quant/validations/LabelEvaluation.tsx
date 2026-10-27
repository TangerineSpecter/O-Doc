import type {QuantLabelEvaluation,QuantLabelTarget} from '../../../types/api/quantLabels';

export function LabelEvaluation({target,value,purpose='fixed'}:{target:QuantLabelTarget;value?:QuantLabelEvaluation;purpose?:'fixed'|'test'}) {
    return <section className="space-y-3 border-t border-slate-100 pt-4" aria-label="远期标签评价">
        <h5 className="text-sm font-semibold">未来 {target.horizon_bars} 根收盘收益 · 标签评价</h5>
        <p className="text-xs leading-6 text-slate-500">使用收盘时的因子值，对应未来指定柱数后的收盘收益。段末跨界起点剔除；标签相关与成交收益分别计算。</p>
        {value?<><dl className="divide-y divide-slate-100 text-xs leading-7">{[
            ['有效配对 / 可配对起点',`${value.pairs} / ${value.window.possible_pairs}`],['跨界剔除 / 预测值缺失',`${value.window.purged_origins} / ${value.missing_predictors}`],
            ['Pearson IC',value.pearson_ic===null?'未定义':value.pearson_ic.toFixed(4)],['Spearman IC',value.spearman_ic===null?'未定义':value.spearman_ic.toFixed(4)],
        ].map(([label,text])=><div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-1"><dt className="text-slate-500">{label}</dt><dd className="tabular-nums text-slate-800">{text}</dd></div>)}</dl>
            {value.status==='insufficient' && <p className="text-xs leading-6 text-amber-800">{value.reason==='too_few_valid_pairs'?'有效配对不足5对，相关系数保持未知。':'输入为常量或接近常量，部分相关系数未定义。'}</p>}
            <details><summary className="cursor-pointer text-xs text-orange-700">查看标签区间与解释边界</summary><div className="mt-2 space-y-2 text-xs leading-6 text-slate-500"><p className="break-words">评价 {value.start_timestamp} 至 {value.end_timestamp}；最后预测起点 {value.last_origin_timestamp}。</p>{value.limitations.map(text=><p key={text}>{text}</p>)}</div></details>
        </>:<p className="text-xs leading-6 text-slate-500">{purpose==='test'?'尚无完整测试标签；测试不参与本折参数选择。':'目标已冻结；绑定行情并完成计算后显示。此固定验证不搜索参数。'}</p>}
        <p className="text-xs leading-6 text-slate-500">这是描述性相关，不提供 p 值。重叠标签的配对数不等于独立样本量，也不证明参数最优。</p>
    </section>;
}
