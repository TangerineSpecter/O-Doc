import type {QuantValidationAudit} from '../../../types/api/quantValidation';
const names={reused:'发现已知重用',no_tracked_conflict:'未发现已知重用',unknown_incomplete_scan:'扫描不完整，重用状态未知'};
export function ValidationAudit({value,label}: {value: QuantValidationAudit;label: string}) {
    return <section className="space-y-2 rounded-xl bg-slate-50 p-4" aria-label={label}>
        <h5 className="text-sm font-medium text-slate-700">{label} · {names[value.range_status]}</h5>
        <p className="text-xs leading-6 text-slate-500">扫描{value.complete_scan?'覆盖已记录的范围':'达到数量或大小上限'}，发现 {value.conflict_count} 条重叠记录。外部使用未知，全局独立性尚未证明。</p>
        <details className="text-xs leading-6 text-slate-500"><summary className="cursor-pointer text-orange-700">查看审计范围与重叠记录</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">{value.limitations.map(t=><li key={t}>{t}</li>)}</ul>
            {value.conflicts.map(r=><p key={r.key} className="mt-2 break-all">{r.kind} · {r.start} → {r.end} · {r.reason==='identical_rows'?'完整行情内容相同':'同标的与周期区间重叠'}<br/>{r.key} · 文集 {r.collection_id}</p>)}
            {value.omitted_conflicts>0 && <p>另有 {value.omitted_conflicts} 条重叠记录未展开，完整清单随快照保留。</p>}
        </details>
    </section>;
}
