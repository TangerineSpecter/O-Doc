import type {InventoryItem} from '../../types/api/travel';

const rarities: Record<string, string> = {common: '普通', uncommon: '精良', rare: '稀有', epic: '史诗', legendary: '传说'};

export function InventoryItemCard({item}: {item: InventoryItem}) {
    return <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-slate-800">{item.name}<span className="ml-2 text-orange-600">×{item.quantity}</span></p><span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700">{rarities[item.rarity] || '普通'}</span></div>
        <p className="text-xs text-slate-500">来自 {item.source.destination?.city || '旅行'} · {item.source.debug ? '调试参考单价' : '购入单价'} {item.source.unitPrice || '—'} 世界币</p>
        {item.source.debug && <p className="text-xs text-amber-700">本地调试补录，未扣余额</p>}
        <p className="text-xs text-slate-600">单件参考价值：{item.value ?? item.source.unitPrice ?? '—'} 世界币</p>
        <p className="text-xs text-slate-500" title={item.actorId}>当前所属：{item.actorName || item.actorId || '未知'}</p>
        <p className="text-xs text-slate-500" title={item.originActorId}>原始获得者：{item.originActorName || item.originActorId || '历史记录未提供'}</p>
    </div>;
}
