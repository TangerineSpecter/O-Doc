import {useState} from 'react';
import {useTravelDetail} from '../../hooks/useTravelDetail';
import type {TravelJourney, TravelOperation} from '../../types/api/travel';
import WorldDialog from './WorldDialog';
import TravelPhotoPreview from './TravelPhotoPreview';
import ResourceImagePickerModal from '../Editor/ResourceImagePickerModal';
import {useToast} from '../common/ToastProvider';

export const travelStatus: Record<string, string> = {active: '旅行进行中', waiting: '等待恢复', manual: '需要人工处理', paused: '已暂停', completed: '已返程', skipped: '本次未出行'};
export const travelPhase: Record<string, string> = {preview: '准备目的地资料', choose: '选择目的地', plan: '准备行程', depart: '准备出发', food: '当地美食', buy: '纪念品购物', return: '返程', journal: '写旅行日记', publish: '发布日记', done: '完成'};

export default function TravelDetailDialog({journey: initial, onClose, onChanged}: {journey: TravelJourney; onClose: () => void; onChanged: () => void}) {
    const {journey, error, act: updateTravel} = useTravelDetail(initial);
    const [busy, setBusy] = useState(false);
    const [picker, setPicker] = useState(false);
    const [confirmation, setConfirmation] = useState<'end' | 'regenerate_image' | null>(null);
    const toast = useToast();
    const state = journey.snapshot;
    const act = async (action: TravelOperation, assetId?: string) => {
        setBusy(true);
        try {await updateTravel(action, {assetId, confirmCharge: action === 'regenerate_image'}); onChanged(); toast.success('操作已保存');}
        catch (e) {toast.error(e instanceof Error ? e.message : '操作失败');}
        finally {setBusy(false); setConfirmation(null);}
    };
    const button = 'rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:border-orange-200 hover:bg-orange-50 disabled:opacity-50';
    return <WorldDialog title={`${state.agentName}的旅行`} description="Agent 模拟游记 · 图片为生成插画" onClose={onClose}>
        <div className="space-y-5">
            {error && <p role="status" className="text-xs text-amber-700">{error}，稍后自动重试。</p>}
            <div className="rounded-2xl bg-orange-50 p-4"><p className="font-semibold text-slate-800">{state.selected ? `${state.selected.country} · ${state.selected.city}` : '尚未选择目的地'}</p><p className="mt-1 text-xs text-orange-700">{travelStatus[journey.status]} · {travelPhase[journey.phase] || (journey.phase.startsWith('visit-') ? '景点游览' : '旅途遭遇')}</p>{state.selected && <p className="mt-2 text-sm text-slate-600">旅行总价 {state.selected.price} 世界币{journey.departedAt ? ' · 已结算' : ' · 尚未扣款'}</p>}</div>
            {state.selection && <p className="text-sm leading-6 text-slate-600">选择理由：{state.selection.reason} · 购物预算 {state.selection.shoppingBudget} 世界币</p>}
            {state.skipReason && <p className="text-sm text-slate-500">{state.skipReason}</p>}
            {!['completed', 'skipped'].includes(journey.status) && <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void act(journey.status === 'paused' || journey.status === 'manual' || journey.status === 'waiting' ? 'resume' : 'pause')}>{['paused', 'manual', 'waiting'].includes(journey.status) ? '恢复旅行' : '暂停旅行'}</button><button className={button} disabled={busy} onClick={() => setConfirmation('end')}>结束旅行</button></div>}
            {state.visits?.map((visit, i) => <div key={i} className="rounded-xl border border-slate-100 p-3"><p className="text-sm font-medium text-slate-800">{visit.site.name} · {visit.choice}</p><p className="mt-1 text-sm leading-6 text-slate-500">{visit.reaction}</p></div>)}
            {state.encounters?.map((event, i) => <div key={i} className="rounded-xl bg-slate-50 p-3"><p className="text-sm text-slate-700">{event.description}</p><p className="mt-1 text-sm text-slate-500">{event.choice} · {event.reaction}</p></div>)}
            {state.food && <p className="text-sm leading-6 text-slate-600">当地美食：{state.food.choice} · {state.food.reaction}</p>}
            {state.shopping && <div className="space-y-2 text-sm text-slate-600"><p>纪念品：{state.shopping.reason}</p>{state.shopping.basket.map(item => {const good = state.goods?.find(g => g.id === item.id); return <p key={item.id}>{good?.name} × {item.quantity} · {Number(good?.price || 0)*item.quantity} 世界币</p>;})}</div>}
            {state.draft && <div className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-800">{state.draft.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{state.draft.content}</p><p className="mt-3 text-xs text-slate-500">旅行心得：{state.draft.reflection}</p></div>}
            {journey.articleId && <a href={`/editor/${journey.articleId}`} className="inline-block text-sm text-orange-600">打开旅行日记</a>}
            {state.photo && <div className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-medium text-slate-700">场景照：{{pending: '等待生成', generating: '正在生成', manual: '需要处理', inserted: '已补入原帖', abandoned: '已放弃'}[state.photo.status] || state.photo.status}</p>{state.photo.error && <p className="mt-2 text-xs leading-5 text-amber-700">{state.photo.error}</p>}<TravelPhotoPreview imageUrl={state.photo.imageUrl}/>{state.photo.status !== 'inserted' && <div className="mt-3 flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void act('query_image')}>恢复查询</button><button className={button} disabled={busy} onClick={() => setConfirmation('regenerate_image')}>重新生成</button><button className={button} disabled={busy} onClick={() => setPicker(true)}>选择已有图片</button><button className={button} disabled={busy} onClick={() => void act('abandon_image')}>放弃配图</button></div>}</div>}
            {journey.nodes?.filter(node => node.error).map(node => <p key={node.id} className="text-xs text-amber-700">{node.kind}：{node.error}</p>)}
            {state.sources?.length ? <div className="space-y-1"><p className="text-xs font-medium text-slate-500">地方资料来源</p>{state.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-orange-600">{source.title || source.url}</a>)}</div> : null}
        </div>
        {picker && <ResourceImagePickerModal isOpen onClose={() => setPicker(false)} onSelect={id => {setPicker(false); void act('use_image', id);}}/>}
        {confirmation && <WorldDialog title={confirmation === 'end' ? '结束这次旅行？' : '重新生成场景照？'} onClose={() => setConfirmation(null)}><p className="text-sm leading-6 text-slate-600">{confirmation === 'end' ? '已出发的费用不自动退还，已获得物品保留，并根据已发生经历写日记。' : '新请求可能再次计费；原请求提交结果未知时也可能已经扣费。确认后才提交新请求。'}</p><div className="mt-4 flex justify-end gap-2"><button className={button} onClick={() => setConfirmation(null)}>取消</button><button className="rounded-xl bg-orange-500 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void act(confirmation)}>确认</button></div></WorldDialog>}
    </WorldDialog>;
}
