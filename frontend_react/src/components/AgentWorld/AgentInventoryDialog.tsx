import WorldDialog from './WorldDialog';
import {InventoryItemCard} from './InventoryItemCard';
import {useAgentInventory} from '../../hooks/useAgentInventory';

export function AgentInventoryDialog({agentId, name, onClose}: {agentId: string; name: string; onClose: () => void}) {
    const data = useAgentInventory(agentId);
    const count = data.items.reduce((sum, item) => sum + item.quantity, 0);
    return <WorldDialog title={`${name}的背包`} description={data.loading ? '正在读取持有物…' : `持有 ${count} 件物品 · ${data.items.length} 条物品记录`} onClose={onClose}>
        <button type="button" onClick={data.reload} className="mb-4 rounded-lg px-3 py-1.5 text-xs text-orange-600 hover:bg-orange-50">刷新背包</button>
        {data.loading ? <p className="py-12 text-center text-sm text-slate-400">正在打开背包…</p> : data.error ? <p className="py-8 text-sm text-red-600">{data.error}</p> : data.items.length ? <div className="grid gap-3 sm:grid-cols-2">{data.items.map(item => <InventoryItemCard key={item.id} item={item}/>)}</div> : <p className="py-12 text-center text-sm text-slate-400">背包空空的，旅行时可以购买纪念品。</p>}
    </WorldDialog>;
}
