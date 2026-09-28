import {useEffect, useRef, useState} from 'react';
import {BookOpenText, Package, Search} from 'lucide-react';
import WorldDialog from './WorldDialog';
import {ItemIconImage} from './ItemIconImage';
import {farmItemIcon} from '../Farm/assets';
import {useItemCatalog} from '../../hooks/useItemCatalog';
import type {ItemCategory} from '../../types/api/itemCatalog';

const categories: {value: 'all' | ItemCategory; label: string}[] = [
    {value: 'all', label: '全部'}, {value: 'souvenir', label: '纪念品'}, {value: 'seed', label: '种子'},
    {value: 'feed', label: '饲料'}, {value: 'crop', label: '农作物'}, {value: 'animal_product', label: '畜产品'}, {value: 'other', label: '其他'},
];

export default function ItemCatalogDialog({onClose}: {onClose: () => void}) {
    const {items, loading, error, reload} = useItemCatalog();
    const [category, setCategory] = useState<'all' | ItemCategory>('all');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const content = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        content.current?.focus();
        const dialog = content.current?.closest('[role="dialog"]');
        const trap = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return;
            const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === content.current)) {event.preventDefault(); last?.focus();}
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === content.current)) {event.preventDefault(); first?.focus();}
        };
        dialog?.addEventListener('keydown', trap as EventListener);
        return () => {dialog?.removeEventListener('keydown', trap as EventListener); document.body.style.overflow = overflow; previous?.focus();};
    }, []);
    const visible = items.filter(item => (category === 'all' || item.category === category) &&
        `${item.name} ${item.sku}`.toLowerCase().includes(search.trim().toLowerCase()));
    const selected = visible.find(item => item.id === selectedId) || visible[0];
    return <WorldDialog title="物品图鉴" description="认识世界中的物品，看看它们的用途与价值。" onClose={onClose} size="wide">
        <div ref={content} tabIndex={-1} className="space-y-4 outline-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1" aria-label="物品分类">
                    {categories.map(tab => <button key={tab.value} type="button" aria-pressed={category === tab.value} onClick={() => setCategory(tab.value)}
                        className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${category === tab.value ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{tab.label}</button>)}
                </div>
                <label className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-500/20 sm:w-56">
                    <Search className="h-4 w-4 shrink-0 text-slate-400"/><input aria-label="搜索物品" placeholder="搜索名称或物品编号" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 w-full bg-transparent text-xs outline-none"/>
                </label>
            </div>
            <p className="text-xs text-slate-500">农牧物品显示当前目录；纪念品及其他物品来自居民现有背包。数量为所有居民当前持有的总数。</p>
            {loading ? <p className="py-16 text-center text-sm text-slate-500">正在翻开图鉴…</p> : error ? <div role="alert" className="rounded-2xl bg-red-50 p-6 text-center text-sm text-red-700">{error}<button type="button" onClick={reload} className="ml-3 shrink-0 whitespace-nowrap underline">重新加载</button></div> : !visible.length ?
                <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center"><BookOpenText className="mx-auto h-8 w-8 text-orange-300"/><p className="mt-3 text-sm text-slate-500">{search ? '没有找到匹配的物品' : '这一类暂时没有物品'}</p></div> :
                <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                    <div className="grid grid-cols-[repeat(auto-fill,104px)] justify-start gap-2">
                        {visible.map(item => <button type="button" key={item.id} title={item.name} onClick={() => setSelectedId(item.id)} aria-pressed={selected?.id === item.id}
                            className={`flex h-[118px] w-[104px] min-w-0 flex-col items-center rounded-xl border bg-white p-2.5 text-center transition-colors focus-visible:outline-orange-500 ${selected?.id === item.id ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200 hover:border-orange-200'}`}>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50"><ItemIconImage src={item.iconUrl || farmItemIcon(item.sku)} alt={item.name} className="h-8 w-8" fallback={<Package className="h-5 w-5 text-orange-300"/>}/></span>
                            <span className="mt-1.5 line-clamp-2 h-8 max-w-full break-words text-xs font-semibold leading-4 text-slate-800">{item.name}</span>
                            <span className={`mt-0.5 text-[10px] ${item.quantity ? 'text-lime-700' : 'text-slate-400'}`}>{item.quantity ? `持有 ${item.quantity}` : '暂未持有'}</span>
                        </button>)}
                    </div>
                    {selected && <section aria-label="物品详情" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-0">
                        <p className="text-[10px] font-bold tracking-widest text-orange-500">物品档案</p>
                        <h3 className="mt-2 text-lg font-bold text-slate-900">{selected.name}</h3>
                        <div className="mt-2 flex gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{categories.find(tab => tab.value === selected.category)?.label}</span>{selected.quality === 'gold' && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">金色品质</span>}</div>
                        <p className="mt-4 break-words text-sm leading-relaxed text-slate-600">{selected.description}</p>
                        <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
                            <div className="flex justify-between gap-2"><dt className="text-slate-500">当前持有</dt><dd className="font-semibold text-slate-800">{selected.quantity}</dd></div>
                            {selected.purchasePrice !== null && <div className="flex justify-between gap-2"><dt className="text-slate-500">购买价</dt><dd>{selected.purchasePrice} 世界币</dd></div>}
                            {selected.salePrice !== null && <div className="flex justify-between gap-2"><dt className="text-slate-500">商店回收价</dt><dd>{selected.salePrice} 世界币</dd></div>}
                        </dl>
                        {selected.sku && <p className="mt-4 break-all font-mono text-[10px] text-slate-400">{selected.sku}</p>}
                        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">价格与规则为当前目录，进行中的生长和生产周期沿用开始时的配置。</p>
                    </section>}
                </div>}
        </div>
    </WorldDialog>;
}
