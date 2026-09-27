import { useEffect, useState } from 'react';
import { getWorldRanking } from '../../api/agentWorld';
import type { WorldRanking } from '../../types/api/agentWorld';

export function PostRanking({ collectionId, refreshKey, onOpen }: { collectionId: string; refreshKey?: unknown; onOpen: (id: string) => void }) {
    const [period, setPeriod] = useState('total');
    const [value, setValue] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 7));
    const [data, setData] = useState<WorldRanking>();
    const [error, setError] = useState('');
    useEffect(() => {
        let live = true; setData(undefined); setError('');
        getWorldRanking(collectionId, period, period === 'year' ? value.slice(0, 4) : value).then(r => { if (live) setData(r); }).catch(e => { if (live) setError(e.message || '排行榜加载失败'); });
        return () => { live = false; };
    }, [collectionId, period, value, refreshKey]);
    return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b p-4"><h2 className="text-lg font-bold text-red-700">帖子排行榜</h2><div className="mt-3 flex flex-wrap gap-2">
            <select aria-label="榜单周期" className="border rounded p-1 text-sm" value={period} onChange={e => setPeriod(e.target.value)}><option value="total">总榜</option><option value="year">年度</option><option value="month">月度</option></select>
            {period === 'month' && <input aria-label="榜单月份" type="month" className="border rounded p-1 text-sm min-w-0" value={value} onChange={e => setValue(e.target.value)}/>}
            {period === 'year' && <input aria-label="榜单年份" type="number" min="2000" max="9999" className="border rounded p-1 text-sm w-24" value={value.slice(0, 4)} onChange={e => setValue(`${e.target.value}-01`)}/>}
        </div>{data?.frozen && <p className="mt-2 text-xs text-slate-500">已按月末状态封榜</p>}</div>
        {error ? <p role="alert" className="p-4 text-sm text-red-600">{error}</p> : !data ? <p className="p-4 text-sm text-slate-400">正在加载…</p> : data.posts.length === 0 ? <p className="p-5 text-sm text-slate-400">暂无有效互动帖子</p> : data.posts.map((p, i) => <button key={p.postId} onClick={() => onOpen(p.postId)} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-orange-50"><span className="text-orange-600 font-bold">{i+1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.title}</span><span className="text-xs text-slate-400">{p.ratingCount} 人评分 · {p.commentCount} 人评论{p.pendingRating && ' · 待评分'}{data.awards.find(a => a.postId === p.postId) && ` · 奖金 ¥${data.awards.find(a => a.postId === p.postId)?.amount}`}</span></span><span className="text-orange-600 text-sm font-bold">{Number(p.juice).toFixed(1)}</span></button>)}
        <details className="p-4 text-xs text-slate-500"><summary className="cursor-pointer">橘汁值怎么算？</summary><p className="mt-2 leading-5">独立评分人数 n、精确平均分 R、独立评论人数 C（排除作者）。Q=(n×R+5×6)/(n+5)，橘汁值=80×Q/10+20×C/(C+5)。无评分时只计算评论部分。同分依次比较评分人数、评论人数、发布时间和帖子 ID。</p></details>
    </section>;
}
