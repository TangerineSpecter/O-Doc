import type {QuantSearchResult} from '../../types/api/quantRetrieval';
const messages: Record<QuantSearchResult['search']['semanticStatus'], string> = {
    ready: '已结合文字与语义相关度排序', no_model: '未配置默认向量模型，本次仅按文字检索',
    no_index: '筛选范围内尚无可用索引，本次仅按文字检索；可从关系图谱建立索引',
    unavailable: '向量服务暂不可用，已保留文字命中结果', model_changed: '检索期间模型发生变更，本次仅保留文字结果',
    no_compatible_index: '当前索引已失效或向量维度不匹配，本次仅按文字检索',
    local_demo: '本地样例演示检索依据，不调用真实向量模型',
};
export function FactorSearchSummary({result}: {result: QuantSearchResult}) {
    const info = result.search;
    return <div role="status" className="mt-3 space-y-1 text-xs leading-6 text-slate-500">
        <p>{messages[info.semanticStatus]}。{info.modelName && `模型：${info.modelName}。`}</p>
        <p>筛选范围 {info.candidateTotal} 条，当前索引覆盖 {info.indexedTotal} 条；匹配 {info.matchedGroups} 组，展示前 {info.returnedGroups} 组。语义相近不代表公式等价或收益有效。</p>
    </div>;
}
