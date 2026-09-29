import {useEffect, useRef} from 'react';
import {RefreshCw, Store} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {useMarket} from '../../hooks/useMarket';
import type {MarketTab} from '../../types/api/market';
import {MarketShop} from './MarketShop';
import {MarketListings} from './MarketListings';
import {MarketSessions, MarketTransactions} from './MarketRecords';
const tabs: Array<{value: MarketTab; label: string}> = [{value:'shop',label:'系统商店'},{value:'listings',label:'居民集市'},{value:'transactions',label:'交易记录'},{value:'sessions',label:'市场动态'}];
export default function MarketDialog({onClose, residents}: {onClose: () => void; residents: Array<{id: string; name: string}>}) {
    const market = useMarket();
    const data = market.tab === 'listings' ? market.listings : market.tab === 'transactions' ? market.transactions : market.sessions;
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        containerRef.current?.closest('.overflow-y-auto')?.scrollTo({top: 0, behavior: 'instant'});
    }, [market.tab]);

    return <WorldDialog title="世界市场" onClose={onClose} size="wide"><div ref={containerRef} className="space-y-5">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><Store className="h-5 w-5"/></div><div><p className="text-sm font-semibold text-slate-800">居民的日常集市</p><p className="mt-1 text-xs leading-relaxed text-slate-500">逛市场消耗 5 点体力，居民自主购买、出售和上架。这里可以查看实时库存与交易。</p><p className="mt-1 text-xs leading-relaxed text-slate-400">请先在设置 → Agent → 任务中配置「市场交易」；农场任务不再负责采购与出售。</p></div></div>
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-slate-100 p-1">{tabs.map(tab => <button type="button" key={tab.value} onClick={()=>market.setTab(tab.value)} aria-pressed={market.tab === tab.value} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition-colors ${market.tab === tab.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{tab.label}</button>)}</div><button type="button" onClick={market.refresh} aria-label="刷新市场" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><RefreshCw className={`h-4 w-4 ${market.loading ? 'animate-spin' : ''}`}/></button></div>
        {market.tab !== 'shop' && <div className="flex flex-wrap gap-3">{market.tab === 'listings' && <input aria-label="搜索市场商品" placeholder="搜索商品名称" value={market.search} onChange={e=>market.setSearch(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-300"/>}<div className="min-w-40"><Select menuPortal value={market.actorId} onChange={market.setActorId} options={[{value:'',label:'全部居民'},...residents.map(r=>({value:r.id,label:r.name}))]}/></div></div>}
        {market.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-600">{market.error}</p>}
        {market.loading && !data && market.tab !== 'shop' ? <p className="py-12 text-center text-sm text-slate-400">正在加载市场…</p> : market.tab === 'shop' ? (market.shop ? <MarketShop shop={market.shop}/> : <p className="py-12 text-center text-sm text-slate-400">正在准备商店…</p>) : !data?.items.length ? <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">{market.tab === 'listings' ? (market.search ? '没有找到匹配的商品' : '还没有居民上架商品') : '暂无市场记录'}</p> : market.tab === 'listings' ? <MarketListings items={market.listings?.items || []}/> : market.tab === 'transactions' ? <MarketTransactions items={market.transactions?.items || []}/> : <MarketSessions items={market.sessions?.items || []}/>}
        {market.tab !== 'shop' && data && data.total > 20 && <div className="flex items-center justify-center gap-4 text-xs text-slate-500"><button type="button" disabled={market.page<=1} onClick={()=>market.setPage(market.page-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">上一页</button><span>第 {market.page} 页 · 共 {data.total} 条</span><button type="button" disabled={market.page*20>=data.total} onClick={()=>market.setPage(market.page+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">下一页</button></div>}
    </div></WorldDialog>;
}
