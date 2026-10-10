import {useState} from 'react';
import {Lock, Unlock, Shuffle, X, Sprout, History, Settings2} from 'lucide-react';
import type {MemoItem} from '../../types/api/memo';
import type {SproutTool} from '../../types/api/sprout';
import {useMemoCollision} from '../../hooks/useMemoCollision';
import {useSprout} from '../../hooks/useSprout';
import {useSproutPublication} from '../../hooks/useSproutPublication';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {Select} from '../common/Select';
import SproutOutput from './SproutOutput';
import ConfirmationModal from '../common/ConfirmationModal';

function readPreferences(): {modelId: string; tools: SproutTool[]} {
    try {
        const saved = JSON.parse(localStorage.getItem('memo-sprout-preferences') || '{}');
        return {modelId: typeof saved.modelId === 'string' ? saved.modelId : '', tools: Array.isArray(saved.tools) ? saved.tools.filter((tool: SproutTool) => typeof tool.serverId === 'string' && typeof tool.name === 'string').slice(0, 4) : []};
    }
    catch {return {modelId: '', tools: []};}
}
export default function MemoCollision({pool}: {pool: MemoItem[]}) {
    const collision = useMemoCollision(pool);
    const sprout = useSprout();
    const publication = useSproutPublication(collision.open, sprout.active?.id, sprout.refresh);
    const [direction, setDirection] = useState('');
    const [preferences, setPreferences] = useState(readPreferences);
    const [settings, setSettings] = useState(false);
    const [history, setHistory] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    useEscapeDismissal(collision.open, collision.close);
    const configure = (next: typeof preferences) => {setPreferences(next); localStorage.setItem('memo-sprout-preferences', JSON.stringify(next));};
    const running = !!sprout.active && ['pending', 'running'].includes(sprout.active.status);
    return <>
        <ConfirmationModal isOpen={!!deleting} onClose={() => setDeleting(null)} onConfirm={async () => {if (deleting) await sprout.remove(deleting); setDeleting(null);}} title="删除发芽记录" description="这条记录将永久删除，并同步到其他设备。已保存文章和原始闪念会保留。" confirmText="删除记录"/>
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => {collision.launch(); setHistory(false);}} disabled={!pool.length} className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 disabled:opacity-40"><Shuffle size={14}/>灵感碰撞</button>
            <button type="button" onClick={() => {collision.show(); setHistory(true); void sprout.refresh();}} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"><History size={14}/>发芽记录{running ? ' · 生成中' : ''}</button>
        </div>
        {collision.open && <div data-modal-scroll-lock role="dialog" aria-modal="true" aria-label="灵感碰撞" className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-sm sm:p-6" onClick={collision.close}>
            <section className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={event => event.stopPropagation()}>
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">{history ? '发芽记录' : '灵感碰撞'}</h2><p className="mt-1 text-xs text-slate-500">几张碎片，一个意外的新角度。</p></div><div className="flex gap-2"><button aria-label="发芽设置" type="button" onClick={() => setSettings(!settings)} className="rounded-full p-2 hover:bg-slate-100"><Settings2 size={18}/></button><button aria-label="关闭灵感碰撞" type="button" onClick={collision.close} className="rounded-full p-2 hover:bg-slate-100"><X size={18}/></button></div></header>
                <div className="scrollbar-hide min-h-0 overflow-y-auto p-4 sm:p-6">
                    {settings && <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"><label className="mb-2 block text-sm font-medium">写作模型</label><Select menuPortal value={preferences.modelId} onChange={modelId => configure({...preferences, modelId})} options={[{value: '', label: '系统主模型'}, ...sprout.options.models.map(model => ({value: model.id, label: model.name}))]}/><p className="mb-2 mt-4 text-sm font-medium">调研工具（最多四个，仅选择搜索／网页读取工具）</p><div className="space-y-2">{sprout.options.tools.map(tool => <label key={`${tool.serverId}:${tool.name}`} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={preferences.tools.some(t => t.serverId === tool.serverId && t.name === tool.name)} onChange={event => configure({...preferences, tools: event.target.checked ? [...preferences.tools, tool].slice(0, 4) : preferences.tools.filter(t => t.serverId !== tool.serverId || t.name !== tool.name)})}/><span>{tool.label}</span></label>)}{!sprout.options.tools.length && <p className="text-xs text-slate-500">在系统设置中配置搜索 MCP，并开放给 AI 对话后，可在这里选择。</p>}</div></div>}
                    {history ? <div className="mb-5 space-y-2">{!sprout.records.length && <p className="py-8 text-center text-sm text-slate-400">还没有发芽记录，先抽几张卡片吧。</p>}{sprout.records.map(row => <div key={row.id} className={`flex items-center gap-3 rounded-xl border p-3 ${row.id === sprout.active?.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}><button type="button" onClick={() => {sprout.select(row); setDirection(row.direction);}} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-medium">{row.result.title || '正在发芽的想法'}</p><p className="mt-1 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()} · {row.stage}</p></button><button type="button" onClick={() => setDeleting(row.id)} className="text-xs text-slate-400">删除</button></div>)}<button type="button" onClick={() => {collision.launch(); setHistory(false);}} className="rounded-full bg-orange-50 px-4 py-2 text-sm text-orange-700">再抽一组</button></div> : <>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">从当前范围 {pool.length} 条闪念中抽取 · 已抽 {collision.cards.length} 张</p><div className="flex items-center gap-2"><div className="flex rounded-full bg-slate-100 p-1">{[3, 4, 5].map(count => <button type="button" key={count} onClick={() => collision.changeCount(count)} className={`rounded-full px-3 py-1 text-xs ${collision.count === count ? 'bg-white font-semibold shadow-sm' : 'text-slate-500'}`}>{count} 张</button>)}</div><button type="button" onClick={() => collision.redraw()} className="rounded-full border border-orange-200 px-3 py-2 text-xs text-orange-700">重抽未锁定</button></div></div>
                        <div className="grid gap-3 md:grid-cols-3">{collision.cards.map((card, index) => {const locked = collision.locked.includes(card.memoId); return <article key={card.memoId} className={`flex flex-col rounded-2xl border p-4 ${locked ? 'border-orange-300 bg-orange-50/50' : 'border-slate-200 bg-slate-50/50'}`}><div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium text-orange-500">碎片 {String(index + 1).padStart(2, '0')}</span><button type="button" aria-label={locked ? '解锁卡片' : '锁定卡片'} onClick={() => collision.toggleLock(card.memoId)} className="rounded-full p-1.5 hover:bg-orange-100">{locked ? <Lock size={14}/> : <Unlock size={14}/>}</button></div><p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{card.content.length > 200 ? card.content.slice(0, 200) + '…' : card.content}</p>{card.content.length > 200 && <details className="mt-2 text-sm"><summary className="cursor-pointer text-orange-700">展开全文</summary><p className="mt-2 whitespace-pre-wrap break-words leading-7">{card.content}</p></details>}<div className="mt-auto flex items-center justify-between gap-2 pt-4"><span className="truncate text-xs text-slate-400">{card.creatorName || card.userName || '用户'} · {card.tag || '未归类'}</span><button type="button" disabled={locked || pool.length <= collision.cards.length} onClick={() => collision.replace(card.memoId)} className="shrink-0 text-xs text-orange-600 disabled:opacity-30">换一张</button></div></article>;})}</div>
                        <div className="my-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"><textarea aria-label="发芽方向" value={direction} onChange={event => setDirection(event.target.value)} maxLength={500} placeholder="想从哪个方向看看？也可以留空，让它自己延伸。" className="mb-3 w-full resize-none rounded-xl border border-emerald-100 bg-white p-3 text-sm outline-none focus:border-emerald-400" rows={2}/><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{preferences.tools.length ? '按需调研 · 每次一篇短文' : '灵感写作 · 未配置调研工具'}{collision.cards.length < 2 ? ' · 至少需要两张卡片' : ''}</span><button type="button" disabled={running || sprout.busy || collision.cards.length < 2} onClick={() => void sprout.generate({memoIds: collision.cards.map(card => card.memoId), direction, ...preferences})} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Sprout size={16}/>AI 发芽 🌱</button></div></div>
                    </>}
                    {(sprout.error || publication.error) && <p role="alert" className="my-3 text-sm text-red-600">{sprout.error || publication.error}</p>}
                    {sprout.active && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-emerald-700">{sprout.active.stage}{sprout.active.error ? ` · ${sprout.active.error}` : ''}</p>{running ? <button type="button" onClick={() => void sprout.cancel()} className="text-slate-500">取消生成</button> : <button type="button" disabled={sprout.busy} onClick={() => void sprout.retry({direction, ...preferences})} className="text-emerald-700">重新发芽</button>}</div><SproutOutput record={sprout.active} collections={publication.collections} collection={publication.collection} setCollection={publication.setCollection} onSave={() => void publication.save()} saving={publication.saving}/></div>}
                </div>
            </section>
        </div>}
    </>;
}
