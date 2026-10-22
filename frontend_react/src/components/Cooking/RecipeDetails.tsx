import {RecipeQualityPreview} from './RecipeQualityPreview';
import {useRef, useState, useEffect, useMemo} from 'react';
import {
    Upload,
    Coins,
    Sparkles,
    Zap,
    TrendingUp,
    Flame,
    Info,
    Check,
    AlertCircle,
} from 'lucide-react';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {RecipePortrait} from './RecipePortrait';
import {farmItemIcon} from '../Farm/assets';
import {useRecipeImage} from '../../hooks/useRecipeImage';
import type {CookingRecipe, CookingHistory} from '../../types/api/cooking';
import {recipeStateConfigs} from './recipePresentation';
import {RecipeHistoryView} from './RecipeHistoryView';
import {RecipeDetailsToolbar} from './RecipeDetailsToolbar';
import {recipeStarPrices, recipeStarTiers} from './recipePricing';
import RecipeAdventureEffects from './RecipeAdventureEffects';

export interface RecipeDetailsProps {
    recipe: CookingRecipe;
    history: CookingHistory | null;
    historyPage: number;
    onHistoryPageChange: (newPage: number) => void;
    residentName?: string;
    onOpenImagePicker: () => void;
    onOpenRuleEditor: () => void;
    onRecipeReload?: () => void;
}

export function RecipeDetails({
    recipe,
    history,
    historyPage,
    onHistoryPageChange,
    residentName,
    onOpenImagePicker,
    onOpenRuleEditor,
    onRecipeReload,
}: RecipeDetailsProps) {
    const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
    const [isDragging, setIsDragging] = useState(false);
    const image = useRecipeImage(recipe, onRecipeReload);
    const uploadingImage = image.busy;
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 当切换选中的食谱时，自动切回配方档案
    useEffect(() => {
        setActiveTab('details');
    }, [recipe.id]);

    const stateConfig = recipeStateConfigs[recipe.state] || recipeStateConfigs.unselected;

    // 各星级回收单价：优先取品质预览计算的真实单价，若无则按官方倍率阶梯计算
    const starPrices = useMemo(() => recipeStarPrices(
        recipe.salePrice, recipe.qualityPreviews?.[0]?.portions?.[0]?.starValues,
    ), [recipe.salePrice, recipe.qualityPreviews]);

    // 处理图片本地直接上传并绑定 SKU
    const handleFileUpload = async (file: File) => {
        try {await image.upload(file);}
        finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const historyTotal = history?.total || 0;

    return (
        <section
            aria-label="食谱详情与操作台"
            className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm"
        >
            {/* 隐式文件选择器 */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                disabled={image.busy}
                className="hidden"
                onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileUpload(file);
                }}
            />

            {/* 顶部页签切换栏 */}
            <RecipeDetailsToolbar
                key={recipe.id}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                historyTotal={historyTotal}
                hasCustomImage={Boolean(recipe.iconAssetId)}
                imageBusy={image.busy}
                onOpenImagePicker={onOpenImagePicker}
                onRemoveImage={() => void image.remove()}
                onOpenRuleEditor={onOpenRuleEditor}
            />

            {/* 内容区 */}
            {activeTab === 'history' ? (
                <RecipeHistoryView
                    history={history}
                    page={historyPage}
                    onPageChange={onHistoryPageChange}
                    residentName={residentName}
                />
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hide space-y-3.5">
                    {/* 上传报错提示 */}
                    {image.error && (
                        <div role="alert" className="rounded-xl bg-red-50 p-2 text-xs text-red-600 border border-red-100">
                            {image.error}
                        </div>
                    )}

                    {/* 头部大图橱窗与核心概览（包含上半部基本信息与下半部5星单价阶梯） */}
                    <div className="relative flex flex-col rounded-2xl border border-amber-100/60 bg-gradient-to-br from-amber-50/50 via-orange-50/20 to-white p-3.5 shadow-2xs">
                        {/* 上半部分：大图框 + 菜名/等级/单价区间 */}
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            {/* 拖拽/点击上传大图框 */}
                            <div
                                role="button"
                                tabIndex={0}
                                aria-label="点击或拖入更换菜品图片"
                                aria-disabled={image.busy}
                                onClick={() => !uploadingImage && fileInputRef.current?.click()}
                                onKeyDown={e => {
                                    if ((e.key === 'Enter' || e.key === ' ') && !uploadingImage) {
                                        e.preventDefault();
                                        fileInputRef.current?.click();
                                    }
                                }}
                                onDragEnter={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!uploadingImage) setIsDragging(true);
                                }}
                                onDragOver={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!uploadingImage) setIsDragging(true);
                                }}
                                onDragLeave={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsDragging(false);
                                }}
                                onDrop={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsDragging(false);
                                    if (uploadingImage) return;
                                    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
                                    if (file) void handleFileUpload(file);
                                }}
                                className={`group/img relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border transition-all duration-200 outline-none select-none ${
                                    isDragging
                                        ? 'border-2 border-dashed border-orange-500 bg-orange-100 scale-105 shadow-md ring-4 ring-orange-400/20'
                                        : 'border-amber-200/60 bg-white shadow-2xs hover:border-orange-300 hover:shadow-xs'
                                }`}
                            >
                                <RecipePortrait
                                    recipe={recipe}
                                    className="h-full w-full object-cover rounded-2xl"
                                />

                                {/* 悬停快捷更换浮层 */}
                                {!isDragging && !uploadingImage && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 backdrop-blur-[1px] transition-opacity duration-150 group-hover/img:opacity-100 rounded-2xl text-white">
                                        <Upload className="h-5 w-5 mb-0.5 text-white drop-shadow-xs" />
                                        <span className="text-[9px] font-semibold tracking-tight">换图</span>
                                    </div>
                                )}

                                {uploadingImage && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-xs">
                                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                                    </div>
                                )}
                            </div>

                            {/* 菜名、单价区间与状态徽章 */}
                            <div className="min-w-0 flex-1 text-center sm:text-left">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                                    <h3 className="truncate text-lg font-bold text-slate-800">
                                        {recipe.name}
                                    </h3>
                                    {/* 售价区间徽章 */}
                                    <div
                                        title="各星级品质回收单价区间（1星基础至5星2.2倍）"
                                        className="inline-flex self-center sm:self-auto items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-xs shadow-2xs"
                                    >
                                        <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-amber-100/90 text-amber-600">
                                            <Coins className="h-3.5 w-3.5" />
                                        </span>
                                        <span className="text-[11px] font-medium text-slate-500">回收单价</span>
                                        <span className="text-sm font-extrabold text-amber-800 tracking-tight leading-none">
                                            {starPrices[0]} ~ {starPrices[4]}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                                    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                                        要求厨艺 Lv.{recipe.requiredLevel}
                                    </span>
                                    <span
                                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold ${stateConfig.badgeClass}`}
                                    >
                                        <span className={`h-1.5 w-1.5 rounded-full ${stateConfig.dotClass}`} />
                                        {stateConfig.label}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 下半部分：5星回收单价阶梯 */}
                        <div className="mt-3.5 border-t border-amber-100/80 pt-2.5">
                            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-amber-900">
                                <span className="flex items-center gap-1">
                                    <Sparkles className="h-3 w-3 text-amber-500" />
                                    <span>各星级品质回收单价</span>
                                </span>
                                <span className="text-[10px] font-normal text-amber-700/80">
                                    基础 1.0x · 最高 2.2x
                                </span>
                            </div>
                            <div className="grid grid-cols-5 gap-1.5">
                                {recipeStarTiers.map((tier, idx) => (
                                    <div
                                        key={tier.star}
                                        className="flex flex-col items-center justify-center rounded-xl border border-amber-100/90 bg-white/95 p-1.5 text-center shadow-2xs"
                                    >
                                        <span className="text-[10px] font-bold text-amber-700 leading-none">
                                            ★{tier.star}
                                        </span>
                                        <span className="mt-1 text-xs font-extrabold text-amber-900 leading-none">
                                            {starPrices[idx]}
                                        </span>
                                        <span className="mt-0.5 text-[9px] text-slate-400 leading-none">
                                            {tier.rate}x
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 所需食材清单 */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-800">每份所需食材</h4>
                            <span className="text-[11px] text-slate-400">
                                需 {recipe.ingredients.length} 种食材
                            </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {recipe.ingredients.map(ingredient => {
                                const isReady = ingredient.owned >= ingredient.quantity;
                                const iconSrc = farmItemIcon(ingredient.sku);
                                const diff = ingredient.quantity - ingredient.owned;

                                return (
                                    <div
                                        key={ingredient.sku}
                                        className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-all ${
                                            isReady
                                                ? 'border-emerald-200/70 bg-emerald-50/30'
                                                : 'border-amber-200/70 bg-amber-50/30'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {/* 食材图标 */}
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white p-0.5 shadow-2xs">
                                                <ItemIconImage
                                                    src={iconSrc}
                                                    alt={ingredient.name}
                                                    className="h-full w-full object-cover rounded-md"
                                                    fallback={<div className="text-[10px] font-bold text-slate-400">{ingredient.name[0]}</div>}
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-bold text-slate-800">
                                                    {ingredient.name}
                                                </p>
                                                <p className="text-[11px] text-slate-500">
                                                    需 ×{ingredient.quantity} 份
                                                </p>
                                            </div>
                                        </div>

                                        {/* 持有情况状态 */}
                                        <div className="shrink-0 text-right">
                                            <span
                                                className={`text-xs font-bold ${
                                                    isReady ? 'text-emerald-700' : 'text-amber-700'
                                                }`}
                                            >
                                                持有 {ingredient.owned}
                                            </span>
                                            <div className="mt-0.5">
                                                {isReady ? (
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                                                        <Check className="h-2.5 w-2.5" />
                                                        已齐备
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600">
                                                        <AlertCircle className="h-2.5 w-2.5" />
                                                        缺 {diff}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 制作收益与经营看板 */}
                    <div>
                        <h4 className="mb-2 text-xs font-bold text-slate-800">制作收益与产出</h4>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {/* 加工增值 */}
                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 transition-all hover:bg-slate-50">
                                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>一星加工差额</span>
                                </div>
                                <div className="mt-1 flex items-baseline gap-1">
                                    <span className={`text-base font-bold ${Number(recipe.processingGain) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {Number(recipe.processingGain) > 0 ? '+' : ''}{recipe.processingGain}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                    原料价值 {recipe.ingredientValue}
                                </p>
                            </div>

                            {/* 厨艺经验 */}
                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 transition-all hover:bg-slate-50">
                                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                    <span>基础经验</span>
                                </div>
                                <div className="mt-1 flex items-baseline gap-1">
                                    <span className="text-base font-bold text-amber-600">
                                        +{recipe.experience}
                                    </span>
                                    <span className="text-[10px] text-slate-400">EXP</span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                    一星成品获取
                                </p>
                            </div>

                            {/* 体力消耗 */}
                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 transition-all hover:bg-slate-50">
                                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                    <Zap className="h-3.5 w-3.5 text-sky-500" />
                                    <span>消耗体力</span>
                                </div>
                                <div className="mt-1 flex items-baseline gap-1">
                                    <span className="text-base font-bold text-sky-600">
                                        {recipe.energyCost}
                                    </span>
                                    <span className="text-[10px] text-slate-400">点</span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                    每次制作扣除
                                </p>
                            </div>

                            {/* 制作产能 */}
                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 transition-all hover:bg-slate-50">
                                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                    <Flame className="h-3.5 w-3.5 text-orange-500" />
                                    <span>可制做</span>
                                </div>
                                <div className="mt-1 flex items-baseline gap-1">
                                    <span className="text-base font-bold text-orange-600">
                                        {recipe.maxPortions}
                                    </span>
                                    <span className="text-[10px] text-slate-400">份</span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                    已累计做 {recipe.timesMade} 份
                                </p>
                            </div>
                        </div>
                    </div>

                    <RecipeAdventureEffects effects={recipe.adventureEffects}/>
                    <RecipeQualityPreview key={recipe.id} recipe={recipe}/>

                    {/* 美食描述与制作贴士 */}
                    {recipe.description && (
                        <div className="rounded-xl border border-slate-100 bg-amber-50/20 p-3">
                            <h5 className="text-[11px] font-bold text-slate-700">风味小记</h5>
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                {recipe.description}
                            </p>
                        </div>
                    )}

                    <div className="flex items-start gap-2 rounded-xl bg-slate-50/80 p-3 text-xs text-slate-500 border border-slate-100">
                        <Info className="h-4 w-4 shrink-0 text-orange-400 mt-0.5" />
                        <p className="leading-relaxed text-[11px]">
                            基础调料和水不占库存；小麦、水稻、大豆及向日葵的基础处理包含在制作中。仅使用指定普通食材。
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}
