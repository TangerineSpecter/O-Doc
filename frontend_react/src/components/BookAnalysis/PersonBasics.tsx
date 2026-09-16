import type {ReadingNode, SourceEvidence} from '../../types/bookAnalysis';

const labels: Record<string, string> = {identity: '身份', age: '年龄', occupation: '职业', background: '背景', behavior: '行为', goal: '目标'};
const sections: [string, string][] = [['introduction', '综合介绍'], ['background', '身份与背景'], ['behavior', '行为表现'], ['goals', '目标与动机'], ['relationships', '重要关系'], ['changes', '经历与变化']];

export default function PersonBasics({node, onRead}: {node: ReadingNode; onRead: (source: SourceEvidence) => void}) {
    const profile = node.profile;
    const attrs = profile?.attributes || [];
    const value = (attribute: string) => attrs.filter(item => item.attribute === attribute);
    return <section className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-800">人物画像</h3>{profile && <span className="text-[9px] text-slate-400">截至第 {profile.throughChapter || '—'} 章</span>}</div>
        <dl className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 gap-y-2.5 text-xs"><dt className="text-slate-400">姓名</dt><dd className="break-words text-slate-700">{node.name}</dd><dt className="text-slate-400">别名</dt><dd className="break-words text-slate-700">{node.aliases.join('、') || '未明确'}</dd>{['identity', 'age', 'occupation'].map(key => <div className="contents" key={key}><dt className="text-slate-400">{labels[key]}</dt><dd>{value(key).length ? value(key).map(item => <p key={item.id} className="mb-1 text-slate-700">{item.value}{item.timeLabel && <span className="ml-1 text-[10px] text-slate-400">{item.timeLabel}</span>}{item.evidence && <button onClick={() => onRead(item.evidence!)} className="ml-1.5 text-[10px] text-orange-600">{item.evidence.chapterTitle}</button>}{item.attribution !== 'narrator' && <span className="ml-1 text-[9px] text-amber-600">{item.attribution === 'self_report' ? '本人陈述' : '他人评价'}</span>}</p>) : <span className="text-slate-400">未明确</span>}</dd></div>)}</dl>
        {profile?.state === 'pending' && <p className="mt-3 rounded bg-amber-50 p-2 text-[10px] text-amber-700">事实已保存，画像综合待重试。</p>}
        {profile?.legacy && <p className="mt-3 text-[9px] text-slate-400">由旧版证据补整理，覆盖可能不完整。</p>}
        <div className="mt-4 space-y-4">{sections.map(([key, label]) => {const items = profile?.sections[key] || []; return items.length ? <section key={key}><h4 className="mb-1 text-[10px] text-slate-400">{label}</h4>{items.map((item, index) => <p key={index} className="mb-1 text-xs leading-6 text-slate-600">{item.text}{item.status === 'inferred' && <span className="ml-1 rounded bg-purple-50 px-1 text-[9px] text-purple-600">解读</span>}</p>)}</section> : null;})}</div>
        {!profile?.coveredChapters.length && <p className="mt-4 text-xs text-slate-400">暂无可综合的人物画像。</p>}{!!profile?.missingChapters.length && <p className="mt-3 text-[9px] leading-4 text-slate-400">分析范围不连续，缺少第 {profile.missingChapters.join('、')} 章。</p>}
    </section>;
}
