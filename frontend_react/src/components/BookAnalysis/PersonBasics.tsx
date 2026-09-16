import type {ProfileAttribute, ReadingNode} from '../../types/bookAnalysis';

const sections: [string, string][] = [
    ['introduction', '综合介绍'],
    ['background', '背景'],
    ['behavior', '关键表现'],
    ['goals', '目标与动机'],
    ['changes', '经历与变化'],
];

function AttributeValue({items}: {items: ProfileAttribute[]}) {
    if (!items.length) return <span className="text-slate-400">未明确</span>;
    return <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {items.map((item, index) => <span key={item.id} className="inline-flex items-center text-slate-700">
            {index > 0 && <span className="mr-1 text-slate-300">、</span>}{item.value}
            {item.timeLabel && (item.attribute === 'age' || item.status === 'inferred') && <span className="ml-1 text-[10px] text-slate-400">（{item.timeLabel}）</span>}
            {item.status === 'inferred' && <span className="ml-1 text-[10px] text-purple-500">推断</span>}
        </span>)}
    </div>;
}

export default function PersonBasics({node}: {node: ReadingNode}) {
    const profile = node.profile;
    const attrs = profile?.attributes || [];
    const values = (...attributes: string[]) => attrs.filter(item => attributes.includes(item.attribute));
    const pendingText = profile?.legacy ? '这是升级前的分析结果，人物画像还没有整理完整。再次分析相关章节时会自动重新提取。' : '原文事实已经保存，但这次人物画像没有整理成功。再次分析相关章节即可继续完善。';
    const basics: [string, ProfileAttribute[]][] = [
        ['年龄', values('age')],
        ['职业', values('occupation')],
        ['身份/职务', values('identity', 'role')],
        ['特征', values('trait')],
    ];
    return <section className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-800">人物画像</h3>{profile && <span className="text-[9px] text-slate-400">截至第 {profile.throughChapter || '—'} 章</span>}</div>
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-2.5 text-xs">
            <dt className="text-slate-400">姓名</dt><dd className="break-words text-slate-700">{node.name}</dd>
            <dt className="text-slate-400">别名</dt><dd className="break-words text-slate-700">{node.aliases.filter(alias => alias !== node.name).join('、') || '未明确'}</dd>
            {basics.map(([label, items]) => <div className="contents" key={label}><dt className="text-slate-400">{label}</dt><dd><AttributeValue items={items}/></dd></div>)}
        </dl>
        {profile?.state === 'pending' && <p className="mt-3 rounded bg-amber-50 p-2 text-[10px] leading-5 text-amber-700">{pendingText}</p>}
        {profile?.legacy && profile.state !== 'pending' && <p className="mt-3 text-[9px] text-slate-400">基于升级前的分析结果；再次分析相关章节时会自动更新。</p>}
        <div className="mt-4 space-y-4">{sections.map(([key, label]) => {
            const items = profile?.sections[key] || [];
            return items.length ? <section key={key}><h4 className="mb-1 text-[10px] text-slate-400">{label}</h4>{items.map((item, index) => <p key={`${key}-${index}`} className="mb-1 text-xs leading-6 text-slate-600">{item.text}{item.status === 'inferred' && <span className="ml-1 rounded bg-purple-50 px-1 text-[9px] text-purple-600">解读</span>}</p>)}</section> : null;
        })}</div>
        {!profile?.coveredChapters.length && <p className="mt-4 text-xs text-slate-400">暂无可综合的人物画像。</p>}{!!profile?.missingChapters.length && <p className="mt-3 text-[9px] leading-4 text-slate-400">当前画像尚未覆盖第 {profile.missingChapters.join('、')} 章。</p>}
    </section>;
}
