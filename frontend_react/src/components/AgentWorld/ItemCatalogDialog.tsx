import {useEffect, useMemo, useRef, useState} from 'react';
import {
    BookOpenText,
    Coins,
    ImagePlus,
    Info,
    Package,
    Pencil,
    Search,
    SlidersHorizontal,
    Sparkles,
    Store,
    Tag,
    X,
} from 'lucide-react';
import WorldDialog from './WorldDialog';
import {ItemIconImage} from './ItemIconImage';
import {farmItemIcon} from '../Farm/assets';
import {useItemCatalog} from '../../hooks/useItemCatalog';
import type {CatalogItem, ItemCategory} from '../../types/api/itemCatalog';
import type {CropKind} from '../../types/api/farm';
import {ItemIconPicker} from './ItemIconPicker';
import {ItemIconLibraryDialog} from './ItemIconLibraryDialog';
import {CropRuleEditor} from './CropRuleEditor';

function cropKindFor(item: CatalogItem): CropKind | null {
    if (item.category !== 'crop' && item.category !== 'seed') return null;
    const kind = item.sku.split('.')[1];
    return kind === 'radish' || kind === 'potato' || kind === 'corn' ? kind : null;
}

const categoryDefs: {value: 'all' | ItemCategory; label: string}[] = [
    {value: 'all', label: '全部'},
    {value: 'souvenir', label: '纪念品'},
    {value: 'seed', label: '种子'},
    {value: 'feed', label: '饲料'},
    {value: 'crop', label: '农作物'},
    {value: 'animal_product', label: '畜产品'},
    {value: 'other', label: '其他'},
];

export default function ItemCatalogDialog({onClose}: {onClose: () => void}) {
    const {items, loading, error, reload} = useItemCatalog();
    const [category, setCategory] = useState<'all' | ItemCategory>('all');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const [editingImage, setEditingImage] = useState(false);
    const [editingCrop, setEditingCrop] = useState<CropKind | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const content = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        content.current?.focus();
        const dialog = content.current?.closest('[role="dialog"]');
        const trap = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return;
            const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === content.current)) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === content.current)) {
                event.preventDefault();
                first?.focus();
            }
        };
        dialog?.addEventListener('keydown', trap as EventListener);
        return () => {
            dialog?.removeEventListener('keydown', trap as EventListener);
            document.body.style.overflow = overflow;
        };
    }, []);

    // 计算每个分类对应的物品数量
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {all: items.length};
        for (const item of items) {
            counts[item.category] = (counts[item.category] || 0) + 1;
        }
        return counts;
    }, [items]);

    const visible = useMemo(() => {
        return items.filter(item => {
            const matchCategory = category === 'all' || item.category === category;
            const matchSearch = !search.trim() || `${item.name} ${item.sku}`.toLowerCase().includes(search.trim().toLowerCase());
            return matchCategory && matchSearch;
        });
    }, [items, category, search]);

    const selected = visible.find(item => item.id === selectedId) || visible[0];
    const selectedCropKind = selected ? cropKindFor(selected) : null;
    const selectedCategoryLabel = selected ? categoryDefs.find(tab => tab.value === selected.category)?.label : '';

    return (
        <WorldDialog title="物品图鉴" description="认识世界中的物品，看看它们的用途与价值。" onClose={onClose} size="wide">
            {/* 外层高度增加到 620px，保证右侧卡片与左侧网格均能完整舒展展示，不被截断 */}
            <div ref={content} tabIndex={-1} className="flex h-[620px] flex-col space-y-3 outline-none">
                {/* 顶部工具栏：分类 Tab + 搜索与功能入口 */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 border border-slate-200/50" aria-label="物品分类">
                        {categoryDefs.map(tab => {
                            const count = categoryCounts[tab.value] ?? 0;
                            const isActive = category === tab.value;
                            return (
                                <button
                                    key={tab.value}
                                    type="button"
                                    aria-pressed={isActive}
                                    onClick={() => setCategory(tab.value)}
                                    className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                                        isActive
                                            ? 'bg-white text-orange-600 shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                                    }`}
                                >
                                    <span>{tab.label}</span>
                                    <span
                                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                                            isActive ? 'bg-orange-100 text-orange-700' : 'bg-slate-200/70 text-slate-500'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex w-full items-center gap-2 sm:w-auto">
                        <label className="relative flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-xs focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20 sm:w-56 sm:flex-none transition-all">
                            <Search className="h-4 w-4 shrink-0 text-slate-400" />
                            <input
                                aria-label="搜索物品"
                                placeholder="搜索名称或编号..."
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                                className="min-w-0 w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    aria-label="清空搜索"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </label>
                        <button
                            type="button"
                            onClick={() => setLibraryOpen(true)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 shadow-xs transition-all active:scale-95"
                        >
                            <ImagePlus className="h-3.5 w-3.5 text-orange-500" />
                            图标库
                        </button>
                    </div>
                </div>

                {/* 辅助说明条 */}
                <div className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-1.5 text-xs text-slate-500 border border-slate-100">
                    <Info className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                    <span>农牧物品显示当前世界目录；纪念品及其他物品来自居民现有背包。数量为所有居民当前持有总数。</span>
                </div>

                {/* 主内容区域：固定高度区域，左侧列表独立滚动，右侧详情紧凑固定 */}
                <div className="min-h-0 flex-1">
                    {loading ? (
                        <div className="flex h-full flex-col items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                            <p className="mt-3 text-sm text-slate-500">正在翻开图鉴…</p>
                        </div>
                    ) : error ? (
                        <div role="alert" className="flex h-full flex-col items-center justify-center rounded-2xl bg-red-50 p-6 text-center text-sm text-red-700 border border-red-100">
                            <p>{error}</p>
                            <button type="button" onClick={reload} className="mt-3 font-medium underline hover:text-red-800">
                                重新加载
                            </button>
                        </div>
                    ) : !visible.length ? (
                        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
                            <BookOpenText className="h-10 w-10 text-orange-300" />
                            <p className="mt-3 text-sm font-medium text-slate-600">{search ? '没有找到匹配的物品' : '当前分类下暂无物品'}</p>
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="mt-2 text-xs font-medium text-orange-600 hover:underline"
                                >
                                    清除搜索关键词
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid h-full items-start gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
                            {/* 左侧网格：紧凑卡片尺寸(88x108px)，单项占用空间小，一屏展示更多物品 */}
                            <div className="h-full overflow-y-auto pr-1">
                                <div className="grid grid-cols-[repeat(auto-fill,88px)] content-start gap-2">
                                    {visible.map(item => {
                                        const isSelected = selected?.id === item.id;
                                        const hasQuantity = item.quantity > 0;

                                        return (
                                            <button
                                                type="button"
                                                key={item.id}
                                                title={item.name}
                                                onClick={() => setSelectedId(item.id)}
                                                aria-pressed={isSelected}
                                                className={`group relative flex h-[108px] w-[88px] shrink-0 flex-col items-center justify-between rounded-xl border p-1.5 text-center transition-all duration-150 outline-none ${
                                                    isSelected
                                                        ? 'border-orange-400 bg-orange-50/40 shadow-xs ring-2 ring-orange-500/20'
                                                        : 'border-slate-200 bg-white hover:border-orange-200 hover:shadow-xs'
                                                }`}
                                            >
                                                {/* 紧凑小图标展示区 */}
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 border border-slate-100 transition-transform group-hover:scale-105">
                                                    <ItemIconImage
                                                        src={item.iconUrl || farmItemIcon(item.sku)}
                                                        alt={item.name}
                                                        className="h-7 w-7"
                                                        fallback={<Package className="h-4 w-4 text-slate-300" />}
                                                    />
                                                </div>

                                                {/* 物品名称：双行紧凑高度，居中对齐 */}
                                                <div className="flex h-7 w-full items-center justify-center px-0.5">
                                                    <span
                                                        className={`line-clamp-2 max-w-full break-words text-[11px] font-semibold leading-[14px] transition-colors ${
                                                            isSelected ? 'text-orange-950' : 'text-slate-800 group-hover:text-orange-600'
                                                        }`}
                                                    >
                                                        {item.name}
                                                    </span>
                                                </div>

                                                {/* 持有状态：精简轻量文本，不占过多高度 */}
                                                <div className="flex w-full justify-center">
                                                    <span
                                                        className={`text-[10px] leading-tight ${
                                                            hasQuantity ? 'font-semibold text-emerald-600' : 'text-slate-400'
                                                        }`}
                                                    >
                                                        {hasQuantity ? `持有 ${item.quantity}` : '暂未持有'}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 右侧：第一版重新设计的物品档案详情卡片，完整展示不截断 */}
                            {selected && (
                                <section
                                    aria-label="物品详情"
                                    className="flex h-full flex-col justify-between overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
                                >
                                    <div className="space-y-2.5">
                                        {/* 顶部大图展示橱窗 */}
                                        <div
                                            className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border p-3 text-center ${
                                                selected.quality === 'gold'
                                                    ? 'border-amber-200/80 bg-gradient-to-b from-amber-50/80 via-amber-50/20 to-white'
                                                    : 'border-slate-100 bg-gradient-to-b from-slate-50 via-slate-50/40 to-white'
                                            }`}
                                        >
                                            {/* 标签栏 */}
                                            <div className="flex w-full items-center justify-between gap-1 mb-1.5">
                                                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200/60 shadow-2xs">
                                                    <Tag className="h-2.5 w-2.5 text-slate-400" />
                                                    {selectedCategoryLabel}
                                                </span>
                                                {selected.quality === 'gold' && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-300/60 shadow-2xs">
                                                        <Sparkles className="h-2.5 w-2.5 text-amber-500 fill-current" />
                                                        金色品质
                                                    </span>
                                                )}
                                            </div>

                                            {/* 橱窗大图标 */}
                                            <div className="my-1 flex h-16 w-16 items-center justify-center">
                                                <ItemIconImage
                                                    src={selected.iconUrl || farmItemIcon(selected.sku)}
                                                    alt={selected.name}
                                                    className="h-14 w-14 drop-shadow-md"
                                                    fallback={<Package className="h-8 w-8 text-slate-300" />}
                                                />
                                            </div>

                                            {/* 快捷操作按钮组 */}
                                            <div className="mt-1 flex w-full flex-wrap items-center justify-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingImage(true)}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 hover:border-orange-300 shadow-2xs transition-all active:scale-95"
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                    {selected.iconAssetId ? '更换图片' : '设置图片'}
                                                </button>
                                                {selectedCropKind && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingCrop(selectedCropKind)}
                                                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 shadow-2xs transition-all active:scale-95"
                                                    >
                                                        <SlidersHorizontal className="h-3 w-3" />
                                                        作物规则
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* 标题 */}
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold tracking-widest text-orange-500 uppercase">物品档案</span>
                                                {selected.sku && (
                                                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                                        {selected.sku}
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="mt-0.5 text-base font-bold text-slate-900">{selected.name}</h3>
                                        </div>

                                        {/* 描述说明 */}
                                        {selected.description ? (
                                            <p className="rounded-xl bg-slate-50/80 p-2.5 text-xs leading-relaxed text-slate-600 border border-slate-100">
                                                {selected.description}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-slate-400 italic">暂无物品详细背景描述。</p>
                                        )}

                                        {/* 属性数据网格 (Stat Grid) */}
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                                                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                                    <Package className="h-3 w-3 text-slate-400" />
                                                    <span>当前持有</span>
                                                </div>
                                                <span className={`mt-0.5 text-base font-bold ${selected.quantity > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                    {selected.quantity}
                                                </span>
                                            </div>

                                            <div className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                                                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                                    <Store className="h-3 w-3 text-slate-400" />
                                                    <span>购买单价</span>
                                                </div>
                                                <span className="mt-0.5 text-xs font-semibold text-slate-800">
                                                    {selected.purchasePrice !== null ? `${selected.purchasePrice} 世界币` : '暂不可购'}
                                                </span>
                                            </div>

                                            {selected.salePrice !== null && (
                                                <div className="col-span-2 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
                                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                                        <Coins className="h-3.5 w-3.5 text-amber-500" />
                                                        <span>商店回收单价</span>
                                                    </div>
                                                    <span className="text-xs font-bold text-amber-600">
                                                        {selected.salePrice} 世界币
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 底部规则说明 */}
                                    <p className="mt-2 text-[10px] leading-relaxed text-slate-400 border-t border-slate-100 pt-2">
                                        * 价格与生产规则基于世界实时目录，进行中的生长和生产周期沿用开始时的配置。
                                    </p>
                                </section>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {editingImage && selected && (
                <ItemIconPicker
                    key={selected.id}
                    item={selected}
                    onClose={() => setEditingImage(false)}
                    onSaved={() => {
                        setEditingImage(false);
                        reload();
                    }}
                />
            )}
            {editingCrop && (
                <CropRuleEditor
                    kind={editingCrop}
                    onClose={() => setEditingCrop(null)}
                    onSaved={reload}
                />
            )}
            {libraryOpen && <ItemIconLibraryDialog onClose={() => setLibraryOpen(false)} />}
        </WorldDialog>
    );
}


