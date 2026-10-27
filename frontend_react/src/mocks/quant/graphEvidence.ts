import type {QuantEntryDetail,QuantFactorCandidate} from '../../types/api/quant';
import type {QuantGraph} from '../../types/api/quantGraph';
import {mockVerificationRecords} from './verification';

/** Reuse explicit artificial verification records, never infer support from a score. */
export function appendMockGraphEvidence(graph:QuantGraph,center:QuantFactorCandidate,collection:string,entries:QuantEntryDetail[]) {
    const records=mockVerificationRecords(center,collection);
    const kinds={experiment:'experiment',feedback:'feedback',fixed_validation:'validation',native_python:'native',comparison:'comparison'} as const;
    const titles={experiment:'受控实验（模拟）',feedback:'外部反馈（未核实）',fixed_validation:'固定验证（模拟）',native_python:'原始Python验证（模拟）',comparison:'固定样本对照（模拟）'};
    graph.limited=graph.limited||records.length>12;
    for(const row of records.slice(0,12)) {
        const data=JSON.parse(row.dataJson) as {scope?:string;title?:string;target_hash:string;candidate_hash:string};
        const id=`evidence:${row.id}`;
        const report=row.kind==='feedback'?entries.flatMap(entry=>entry.reports||[]).filter(report=>report.sourceId===row.targetId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]:undefined;
        graph.nodes.push({id,kind:kinds[row.kind],label:data.title||titles[row.kind],entryId:center.entryId,reportId:report?.id||'',
            evidence:{id:row.id,kind:row.kind,targetId:row.targetId,targetHash:data.target_hash,candidateHash:data.candidate_hash,createdAt:row.createdAt}});
        graph.edges.push({id:`observed:${row.id}`,from:`factor:${center.id}`,to:id,kind:'direct_observation',label:data.scope==='native_python_analysis_document'?'同一次原函数验证的解读材料':titles[row.kind],historical:false,similarity:null,
            detail:'本地人工观察记录，仅演示与当前公式的直接关联；失败与未核实反馈保留，连线不代表支持、有效性或真实模型判断。完整参数和记录见下方直接证据。'});
    }
}
