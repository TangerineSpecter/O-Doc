import {useEffect, useRef} from 'react';
import {
    RefreshCw,
    Store,
    ShoppingBag,
    Tag,
    ReceiptText,
    Footprints,
    Search,
    X,
    Sparkles,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    HelpCircle,
} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {useMarket} from '../../hooks/useMarket';
import type {MarketTab} from '../../types/api/market';
import {MarketShop} from './MarketShop';
import {MarketListings} from './MarketListings';
import {MarketSessions, MarketTransactions} from './MarketRecords';

const tabs: Array<{value: MarketTab; label: string; icon: typeof Store}> = [
    {value: 'shop', label: '系统商店', icon: ShoppingBag},
    {value: 'listings', label: '居民集市', icon: Tag},
    {value: 'transactions', label: '交易记录', icon: ReceiptText},
    {value: 'sessions', label: '市场动态', icon: Footprints},
];

export default function MarketDialog({
    onClose,
    residents,
}: {
    onClose: () => void;
    residents: Array<{id: string; name: string}>;
}) {
    const market = useMarket();
    const data =
        market.tab === 'listings'
            ? market.listings
            : market.tab === 'transactions'
              ? market.transactions
              : market.sessions;

    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        containerRef.current?.closest('.overflow-y-auto')?.scrollTo({top: 0, behavior: 'instant'});
    }, [market.tab]);

    const residentOptions = [
        {value: '', label: '全部居民'},
        ...residents.map(r => ({value: r.id, label: r.name})),
    ];

    return (
        <WorldDialog title="世界市场 · 集市大厅" onClose={onClose} size="wide">
            <div ref={containerRef} className="flex h-full min-h-0 flex-1 flex-col overflow-hidden gap-2.5">
                {/* 顶部迎宾 Banner：超紧凑高质感横条，节约垂直高度 */}
                <div className="relative shrink-0 overflow-hidden rounded-xl border border-orange-200/80 bg-gradient-to-r from-orange-50/80 via-amber-50/40 to-lime-50/30 px-3 py-2 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white shadow-2xs">
                                <Store className="h-4 w-4" />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="text-xs font-bold text-slate-800 shrink-0">居民日常集市</span>
                                <span className="rounded-full bg-orange-100/90 px-1.5 py-0.2 text-[9px] font-bold text-orange-700 shrink-0">
                                    自由交易中心
                                </span>
                                <span className="hidden md:inline text-[11px] text-slate-500 truncate">
                                    逛市场消耗 <strong className="text-orange-600 font-semibold">5 点体力</strong> · 居民自主评估采购与挂牌
                                </span>
                            </div>
                        </div>

                        {/* 快捷刷新与操作指引 */}
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="hidden lg:flex items-center gap-1 rounded-lg bg-white/80 px-2 py-0.5 text-[10px] text-slate-500 border border-slate-200/60 shadow-2xs">
                                <HelpCircle className="h-3 w-3 text-orange-400" />
                                <span>在 设置 → Agent → 任务 中配置「市场交易」</span>
                            </div>
                            <button
                                type="button"
                                onClick={market.refresh}
                                aria-label="刷新市场"
                                title="立即刷新集市最新数据"
                                className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600 shadow-2xs transition-all active:scale-95"
                            >
                                <RefreshCw className={`h-3 w-3 text-orange-500 ${market.loading ? 'animate-spin' : ''}`} />
                                <span>刷新</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 胶囊分段导航条 + 快捷检索栏 */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                    {/* 分段控制器 */}
                    <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-slate-100 p-0.5 scrollbar-hide">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            const isActive = market.tab === tab.value;

                            return (
                                <button
                                    type="button"
                                    key={tab.value}
                                    onClick={() => market.setTab(tab.value)}
                                    aria-pressed={isActive}
                                    className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                                        isActive
                                            ? 'bg-white text-orange-600 shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                                    }`}
                                >
                                    <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-orange-500' : 'text-slate-400'}`} />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* 条件过滤区（非系统商店时） */}
                    {market.tab !== 'shop' && (
                        <div className="flex flex-wrap items-center gap-2">
                            {market.tab === 'listings' && (
                                <label className="relative flex min-w-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs shadow-2xs focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20 sm:w-48 transition-all">
                                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                    <input
                                        aria-label="搜索市场商品"
                                        placeholder="搜索商品名称..."
                                        value={market.search}
                                        onChange={e => market.setSearch(e.target.value)}
                                        className="min-w-0 w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
                                    />
                                    {market.search && (
                                        <button
                                            type="button"
                                            onClick={() => market.setSearch('')}
                                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                            aria-label="清空搜索"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </label>
                            )}

                            <div className="w-32 sm:w-40">
                                <Select
                                    menuPortal
                                    value={market.actorId}
                                    onChange={market.setActorId}
                                    options={residentOptions}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* 错误提示条 */}
                {market.error && (
                    <div role="alert" className="flex shrink-0 items-center gap-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-700 border border-red-100">
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                        <span>{market.error}</span>
                    </div>
                )}

                {/* 主内容区域：高度锁死，弹性伸缩，内部局部滚动 */}
                <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
                    {market.loading && !data && market.tab !== 'shop' ? (
                        <div className="flex h-64 flex-col items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                            <p className="mt-3 text-xs text-slate-500">正在翻看集市账本…</p>
                        </div>
                    ) : market.tab === 'shop' ? (
                        market.shop ? (
                            <MarketShop
                                shop={market.shop}
                                recentTransactions={market.transactions?.items || []}
                            />
                        ) : (
                            <div className="flex h-64 flex-col items-center justify-center">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                                <p className="mt-3 text-xs text-slate-500">正在布置商店货架…</p>
                            </div>
                        )
                    ) : !data?.items.length ? (
                        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                            <Sparkles className="h-10 w-10 text-orange-300" />
                            <p className="mt-3 text-sm font-semibold text-slate-700">
                                {market.tab === 'listings'
                                    ? market.search
                                        ? '没有找到符合条件的商品'
                                        : '当前集市暂无居民上架物品'
                                    : '暂无相关交易或动态记录'}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                                稍后或在居民活跃时段再来看看吧
                            </p>
                        </div>
                    ) : market.tab === 'listings' ? (
                        <MarketListings items={market.listings?.items || []} />
                    ) : market.tab === 'transactions' ? (
                        <MarketTransactions items={market.transactions?.items || []} />
                    ) : (
                        <MarketSessions items={market.sessions?.items || []} />
                    )}
                </div>

                {/* 分页控制栏 */}
                {market.tab !== 'shop' && data && data.total > 20 && (
                    <div className="flex shrink-0 items-center justify-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <button
                            type="button"
                            disabled={market.page <= 1}
                            onClick={() => market.setPage(market.page - 1)}
                            className="inline-flex whitespace-nowrap shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            上一页
                        </button>

                        <span className="font-medium text-slate-600">
                            第 {market.page} 页 · 共 {data.total} 条
                        </span>

                        <button
                            type="button"
                            disabled={market.page * 20 >= data.total}
                            onClick={() => market.setPage(market.page + 1)}
                            className="inline-flex whitespace-nowrap shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                        >
                            下一页
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </WorldDialog>
    );
}
