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
    Upload,
    X,
} from 'lucide-react';
import WorldDialog from './WorldDialog';
import {ItemIconImage} from './ItemIconImage';
import {farmItemIcon} from '../Farm/assets';
import {useItemCatalog} from '../../hooks/useItemCatalog';
import type {CatalogItem, ItemCategory} from '../../types/api/itemCatalog';
import {cropKinds, type CropKind} from '../../types/api/farm';
import {ItemIconPicker} from './ItemIconPicker';
import {ItemIconLibraryDialog} from './ItemIconLibraryDialog';
import {CropRuleEditor} from './CropRuleEditor';
import {uploadItemIcon} from '../../api/itemIcons';
import {setCatalogItemIcon, setCatalogInventoryIcon} from '../../api/itemCatalog';

function cropKindFor(item: CatalogItem): CropKind | null {
    if (item.category !== 'crop' && item.category !== 'seed') return null;
    const kind = item.sku.split('.')[1];
    return cropKinds.find(cropKind => cropKind === kind) ?? null;
}

const categoryDefs: {value: 'all' | ItemCategory; label: string}[] = [
    {value: 'all', label: '全部'},
    {value: 'souvenir', label: '纪念品'},
    {value: 'seed', label: '种子'},
    {value: 'fertilizer', label: '肥料'},
    {value: 'feed', label: '饲料'},
    {value: 'crop', label: '农作物'},
    {value: 'animal_product', label: '畜产品'},
    {value: 'dish', label: '美食'},
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
    const [isDragging, setIsDragging] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [dragError, setDragError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const content = useRef<HTMLDivElement>(null);

    const applyItemIconFile = async (file: File, targetItem: CatalogItem) => {
        setUploadingImage(true);
        setDragError('');
        try {
            const uploaded = await uploadItemIcon(file, targetItem.name);
            const invId = targetItem.id.startsWith('inventory:') ? targetItem.id.slice('inventory:'.length) : null;
            if (invId) {
                await setCatalogInventoryIcon(invId, uploaded.id);
            } else if (targetItem.sku) {
                await setCatalogItemIcon(targetItem.sku, uploaded.id);
            }
            reload();
        } catch (err) {
            setDragError(err instanceof Error ? err.message : '设置图片失败，请重试');
        } finally {
            setUploadingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

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
            {/* 撑满外层固定高度弹窗，左右两侧舒展展示且不会产生多余外层滚动条 */}
            <div ref={content} tabIndex={-1} className="flex h-full min-h-[520px] flex-col space-y-3 outline-none">
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
                    <span>农牧物品与美食显示当前世界目录；纪念品及其他物品来自居民现有背包。数量为所有居民当前持有总数。</span>
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
                        <div className="grid h-full items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                            {/* 左侧网格：正方形图标铺满(74x74px)，配微微圆角无缝隙，名字紧凑，空间利用率高且不臃肿 */}
                            <div className="h-full overflow-y-auto pr-1">
                                <div className="grid grid-cols-[repeat(auto-fill,86px)] content-start gap-2.5">
                                    {visible.map(item => {
                                        const isSelected = selected?.id === item.id;
                                        const hasQuantity = item.quantity > 0;

                                        return (
                                            <button
                                                type="button"
                                                key={item.id}
                                                title={`${item.name}${hasQuantity ? ` · 持有 ${item.quantity}` : ' · 暂未持有'}`}
                                                onClick={() => setSelectedId(item.id)}
                                                aria-pressed={isSelected}
                                                className={`group relative flex h-[116px] w-[86px] shrink-0 flex-col items-center justify-start rounded-2xl border p-1.5 text-center transition-all duration-150 outline-none ${
                                                    isSelected
                                                        ? 'border-orange-400 bg-orange-50/50 shadow-xs ring-2 ring-orange-500/25'
                                                        : 'border-slate-200 bg-white hover:border-orange-200 hover:shadow-xs hover:bg-slate-50/30'
                                                }`}
                                            >
                                                {/* 正方形图标展示区：尽可能铺满卡片宽度，微圆角，消除四边缝隙与尖锐直角 */}
                                                <div className="relative flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 transition-transform duration-150 group-hover:scale-[1.02]">
                                                    <ItemIconImage
                                                        src={item.iconUrl || farmItemIcon(item.sku)}
                                                        alt={item.name}
                                                        className="h-full w-full object-cover rounded-xl"
                                                        fallback={<Package className="h-6 w-6 text-slate-300" />}
                                                    />
                                                    {/* 持有数量角标：在正方形图标右上角精致呈现，不挤占下方垂直高度 */}
                                                    {hasQuantity && (
                                                        <span className="absolute right-1 top-1 z-10 rounded-full border border-emerald-500/30 bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-xs backdrop-blur-xs">
                                                            ×{item.quantity}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* 物品名称：正方形下方紧凑居中展示，支持两行文字 */}
                                                <div className="mt-1.5 flex h-7 w-full items-center justify-center px-0.5">
                                                    <span
                                                        className={`line-clamp-2 max-w-full break-words text-[11px] font-semibold leading-[14px] transition-colors ${
                                                            isSelected ? 'text-orange-950' : 'text-slate-800 group-hover:text-orange-600'
                                                        }`}
                                                    >
                                                        {item.name}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 右侧：重新设计的物品档案详情卡片，大图展示与下移的属性描述区域 */}
                            {selected && (
                                <section
                                    aria-label="物品详情"
                                    className="flex h-full flex-col justify-between overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
                                >
                                    {/* 上半部分：大图橱窗 + 档案标题 */}
                                    <div className="flex flex-col gap-2.5">
                                        {/* 顶部大图展示橱窗 */}
                                        <div
                                            className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border p-3 text-center ${
                                                selected.quality === 'gold'
                                                    ? 'border-amber-200/80 bg-gradient-to-b from-amber-50/80 via-amber-50/20 to-white'
                                                    : 'border-slate-100 bg-gradient-to-b from-slate-50 via-slate-50/40 to-white'
                                            }`}
                                        >
                                            {/* 标签栏 */}
                                            <div className="mb-2 flex w-full items-center justify-between gap-1">
                                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs">
                                                    <Tag className="h-2.5 w-2.5 text-slate-400" />
                                                    {selectedCategoryLabel}
                                                </span>
                                                {selected.quality === 'gold' && (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-gradient-to-r from-amber-100 to-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 shadow-2xs">
                                                        <Sparkles className="h-2.5 w-2.5 fill-current text-amber-500" />
                                                        金色品质
                                                    </span>
                                                )}
                                            </div>

                                            {/* 橱窗大图标：支持直接拖拽图片文件设置，或点击快速上传本地图片 */}
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                aria-label="拖拽图片到此或点击直接更换"
                                                onClick={() => !uploadingImage && fileInputRef.current?.click()}
                                                onKeyDown={(e) => {
                                                    if ((e.key === 'Enter' || e.key === ' ') && !uploadingImage) {
                                                        e.preventDefault();
                                                        fileInputRef.current?.click();
                                                    }
                                                }}
                                                onDragEnter={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (!uploadingImage) setIsDragging(true);
                                                }}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (!uploadingImage) setIsDragging(true);
                                                }}
                                                onDragLeave={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setIsDragging(false);
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setIsDragging(false);
                                                    if (uploadingImage || !selected) return;
                                                    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
                                                    if (!file) {
                                                        setDragError('请拖入图片文件（JPG、PNG、WebP 等）');
                                                        return;
                                                    }
                                                    void applyItemIconFile(file, selected);
                                                }}
                                                title="直接拖入图片或点击更换"
                                                className={`group/drop relative my-2 flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border transition-all duration-200 outline-none select-none ${
                                                    isDragging
                                                        ? 'border-2 border-dashed border-orange-500 bg-orange-100/90 scale-105 shadow-md ring-4 ring-orange-400/20'
                                                        : 'border-slate-100/90 bg-white shadow-xs hover:border-orange-300 hover:shadow-md hover:ring-2 hover:ring-orange-500/10'
                                                }`}
                                            >
                                                {/* 物品图片 */}
                                                <ItemIconImage
                                                    src={selected.iconUrl || farmItemIcon(selected.sku)}
                                                    alt={selected.name}
                                                    className="h-full w-full object-cover rounded-2xl transition-transform duration-200 group-hover/drop:scale-105"
                                                    fallback={<Package className="h-10 w-10 text-slate-300" />}
                                                />

                                                {/* 常态 Hover 遮罩浮层 */}
                                                {!isDragging && !uploadingImage && (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 opacity-0 backdrop-blur-[1px] transition-opacity duration-150 group-hover/drop:opacity-100 rounded-2xl text-white">
                                                        <Upload className="h-6 w-6 mb-1 text-white drop-shadow-sm" />
                                                        <span className="text-[11px] font-semibold tracking-wide drop-shadow-xs">拖入或点击更换</span>
                                                    </div>
                                                )}

                                                {/* 拖入状态激活提示 */}
                                                {isDragging && (
                                                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-orange-50/95 text-orange-600 rounded-2xl">
                                                        <Upload className="h-7 w-7 mb-1 text-orange-600 animate-bounce" />
                                                        <span className="text-xs font-bold">松开立即设置</span>
                                                    </div>
                                                )}

                                                {/* 上传中 loading 遮罩 */}
                                                {uploadingImage && (
                                                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/95 backdrop-blur-xs rounded-2xl text-orange-600">
                                                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                                                        <span className="mt-1.5 text-[10px] font-bold text-slate-700">正在设置图片…</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 隐藏的快速文件上传 input */}
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file && selected) void applyItemIconFile(file, selected);
                                                }}
                                            />

                                            {/* 拖拽/上传失败提示 */}
                                            {dragError && (
                                                <p className="mt-0.5 text-[10px] font-medium text-red-500">{dragError}</p>
                                            )}

                                            {/* 快捷操作按钮组 */}
                                            <div className="mt-1 flex w-full flex-wrap items-center justify-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingImage(true)}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-2.5 py-1 text-xs font-medium text-orange-600 shadow-2xs transition-all hover:border-orange-300 hover:bg-orange-50 active:scale-95"
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                    {selected.iconAssetId ? '从图库选择' : '从图库设置'}
                                                </button>
                                                {selectedCropKind && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingCrop(selectedCropKind)}
                                                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-2xs transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 active:scale-95"
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
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500">物品档案</span>
                                                {selected.sku && (
                                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                                                        {selected.sku}
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="mt-0.5 text-base font-bold leading-snug text-slate-900">{selected.name}</h3>
                                        </div>
                                    </div>

                                    {/* 下半部分：下移的描述说明、属性网格与底部规则 */}
                                    <div className="mt-auto space-y-2.5 pt-3">
                                        {/* 描述说明 */}
                                        {selected.description ? (
                                            <p className="rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 text-xs leading-relaxed text-slate-600">
                                                {selected.description}
                                            </p>
                                        ) : (
                                            <p className="text-xs italic text-slate-400">暂无物品详细背景描述。</p>
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

                                            {/* 参考估价 / 价值（如有优先突出） */}
                                            {selected.referenceValue !== null && selected.referenceValue !== undefined ? (
                                                <div className="flex flex-col rounded-xl border border-amber-200/80 bg-gradient-to-b from-amber-50/80 to-amber-50/30 p-2">
                                                    <div className="flex items-center gap-1 text-[11px] font-medium text-amber-800">
                                                        <Coins className="h-3 w-3 text-amber-500" />
                                                        <span>参考估价</span>
                                                    </div>
                                                    <span className="mt-0.5 text-sm font-bold text-amber-900">
                                                        {Number(selected.referenceValue).toLocaleString('zh-CN')} <span className="text-[10px] font-normal text-amber-700">世界币</span>
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                                                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                                        <Store className="h-3 w-3 text-slate-400" />
                                                        <span>购买单价</span>
                                                    </div>
                                                    <span className="mt-0.5 text-xs font-semibold text-slate-800">
                                                        {selected.purchasePrice !== null ? `${selected.purchasePrice} 世界币` : selected.category === 'fertilizer' ? '以商店当前报价为准' : '暂不可购'}
                                                    </span>
                                                </div>
                                            )}

                                            {/* 当已展示参考估价时，补充显示购买渠道或不可购状态 */}
                                            {selected.referenceValue !== null && selected.referenceValue !== undefined && (
                                                <div className="col-span-2 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
                                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                                        <Store className="h-3.5 w-3.5 text-slate-400" />
                                                        <span>购买单价</span>
                                                    </div>
                                                    <span className="text-xs font-medium text-slate-600">
                                                        {selected.purchasePrice !== null ? `${selected.purchasePrice} 世界币` : selected.category === 'fertilizer' ? '以商店当前报价为准' : '暂不可购'}
                                                    </span>
                                                </div>
                                            )}

                                            {/* 各星级品质持有明细与参考单价阶梯 */}
                                            {selected.starQuantities && (
                                                <div className="col-span-2 rounded-xl border border-amber-200/80 bg-gradient-to-b from-amber-50/60 to-amber-50/20 p-2.5 space-y-1.5">
                                                    <div className="flex items-center justify-between text-[11px] font-bold text-amber-800">
                                                        <span className="flex items-center gap-1">
                                                            <Sparkles className="h-3 w-3 text-amber-500" />
                                                            <span>各星级持有与回收单价</span>
                                                        </span>
                                                        <span className="text-[10px] font-normal text-amber-700/80">按星级浮动</span>
                                                    </div>
                                                    <div className="grid grid-cols-5 gap-1.5">
                                                        {Object.entries(selected.starQuantities).map(([star, count]) => {
                                                            const val = selected.starValues?.[star] || 0;
                                                            const hasStock = Number(count) > 0;
                                                            return (
                                                                <div
                                                                    key={star}
                                                                    className="flex flex-col items-center justify-center rounded-lg border border-amber-100/90 bg-white/95 p-1.5 text-center shadow-2xs"
                                                                >
                                                                    <span className="text-[10px] font-bold text-amber-700 leading-none">
                                                                        ★{star}
                                                                    </span>
                                                                    <span
                                                                        className={`mt-1 text-[11px] font-bold leading-none ${
                                                                            hasStock ? 'text-emerald-600' : 'text-slate-400'
                                                                        }`}
                                                                    >
                                                                        ×{count}
                                                                    </span>
                                                                    <span className="mt-1 text-[10px] font-medium text-slate-500 leading-none">
                                                                        {val}币
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
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


