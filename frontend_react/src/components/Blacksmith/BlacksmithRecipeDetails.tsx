import {Check, Info, MapPin, Package, Pencil, ShieldCheck, Zap} from 'lucide-react';
import type {BlacksmithMaterial, BlacksmithRecipe} from '../../types/api/blacksmith';
import {MaterialPortrait} from '../Combat/atlas/MaterialPortrait';
import {BlacksmithEquipmentIcon} from './BlacksmithEquipmentIcon';
import {blacksmithMaterialSources, blacksmithStateLabels} from './blacksmithPresentation';

export function BlacksmithRecipeDetails({
    recipe,
    materials,
    onEdit,
}: {
    recipe: BlacksmithRecipe;
    materials: BlacksmithMaterial[];
    onEdit: () => void;
}) {
    const preview = recipe.types.find(type => type.canEquip) || recipe.types[0];
    const complete = recipe.ingredients.filter(row => row.available >= row.quantity).length;

    return (
        <article
            aria-label="打造配方详情"
            className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs"
        >
            {/* 锻造台顶部头部 */}
            <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 bg-gradient-to-b from-slate-50/70 to-white p-3.5 sm:p-4">
                <div className="relative flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-orange-200/80 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-white p-1 shadow-2xs">
                    <BlacksmithEquipmentIcon
                        slot={recipe.slot}
                        equipmentId={preview?.templateId}
                        equipmentType={preview?.equipmentType}
                        name={preview?.name || recipe.slotName}
                        className="h-full w-full object-contain"
                    />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-800">
                            {recipe.slotName}打造
                        </h3>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                            {recipe.bandLabel}
                        </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                            <Zap className="h-3.5 w-3.5 text-amber-500" />
                            每件消耗 {recipe.energyCost} 体力
                        </span>
                        <span className="inline-flex items-center gap-1 text-slate-600">
                            免加工费
                        </span>
                        <span className="text-slate-400">
                            累计打造 <strong className="font-semibold text-slate-700">{recipe.timesMade}</strong> 件
                        </span>
                        <span className="text-slate-400">
                            单次上限 {recipe.maxPieces} 件
                        </span>
                    </div>
                </div>

                <button
                    type="button"
                    aria-label="编辑配方"
                    onClick={onEdit}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:border-orange-300 hover:bg-orange-50/60 hover:text-orange-700"
                >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>编辑配方</span>
                </button>
            </header>

            {/* 可滚动详情区 */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5 sm:p-4 scrollbar-hide">
                {/* 状态横幅提示 */}
                <div
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed ${
                        recipe.state === 'ready'
                            ? 'border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 to-teal-50/60 text-emerald-900'
                            : recipe.state === 'missing'
                            ? 'border-amber-200/80 bg-gradient-to-r from-amber-50/90 to-orange-50/60 text-amber-900'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                >
                    {recipe.state === 'ready' ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : recipe.state === 'missing' ? (
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    ) : (
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <span className="font-medium">
                        {recipe.state === 'ready'
                            ? `材料已齐备，当前材料余量最多可打造 ${recipe.maxPieces} 件`
                            : recipe.disabledReason || blacksmithStateLabels[recipe.state] || '当前暂不可制作'}
                    </span>
                </div>

                {/* 可打造装备模块 */}
                <section aria-label="可打造装备">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <ShieldCheck className="h-4 w-4 text-orange-500" />
                            可打造装备
                        </h4>
                        <span className="text-[11px] text-slate-500">
                            当前职业路线 · {recipe.types.length} 种类型
                        </span>
                    </div>

                    {recipe.types.length ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                            {recipe.types.map(type => (
                                <div
                                    key={type.templateId}
                                    className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 p-2.5 transition-colors hover:bg-white hover:border-slate-300 hover:shadow-2xs"
                                >
                                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5">
                                        <BlacksmithEquipmentIcon
                                            slot={recipe.slot}
                                            equipmentId={type.templateId}
                                            equipmentType={type.equipmentType}
                                            name={type.name}
                                            className="h-full w-full object-contain"
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-bold text-slate-800">
                                            {type.name}
                                        </p>
                                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                            {type.typeName} · 随机 Lv.{type.levelMin}～{type.levelMax}
                                        </p>
                                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                                            {type.canEquip === false ? (
                                                <span className="rounded bg-violet-50 px-1 py-0.2 text-violet-700 font-medium">
                                                    路线后续可用
                                                </span>
                                            ) : null}
                                            <span>穿戴 Lv.{type.wearLevel}</span>
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center text-xs text-slate-500">
                            当前职业路线在此等级范围没有可打造的装备类型。
                        </div>
                    )}

                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        成品等级在合法范围内随机抽取，品质按图鉴所示概率独立抽取；高于当前等级的装备将自动存入行囊。
                    </p>
                </section>

                {/* 打造所需材料模块 */}
                <section aria-label="打造所需材料">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <Package className="h-4 w-4 text-orange-500" />
                            每件所需材料
                        </h4>
                        <span className="text-[11px] text-slate-500">
                            已齐备 <strong className="text-slate-700">{complete}</strong> / {recipe.ingredients.length} 种 · 可用 / 所需
                        </span>
                    </div>

                    <div className="space-y-2">
                        {recipe.ingredients.map(row => {
                            const material = materials.find(item => item.sku === row.sku);
                            const sources = material ? blacksmithMaterialSources(material, recipe) : [];
                            const missing = Math.max(0, row.quantity - row.available);
                            const isSatisfied = row.available >= row.quantity;
                            const progress = Math.min(100, Math.round((row.available / row.quantity) * 100));

                            return (
                                <div
                                    key={row.sku}
                                    className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs"
                                >
                                    <div className="p-3">
                                        <div className="flex items-center gap-3">
                                            {/* 材料图鉴头像 */}
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 p-1">
                                                <MaterialPortrait
                                                    materialId={row.sku.replace(/^combat\./, '')}
                                                    name={row.name}
                                                    decorative
                                                    className="h-full w-full [&>svg]:h-7 [&>svg]:w-7"
                                                />
                                            </div>

                                            {/* 材料名称与持有量 */}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-bold text-slate-800">
                                                    {row.name}
                                                </p>
                                                <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                                                    持有 {row.owned} · 已预留 {row.reserved}
                                                </p>
                                            </div>

                                            {/* 可用/所需对比与徽章 */}
                                            <div className="shrink-0 text-right">
                                                <p className="text-xs font-bold tabular-nums">
                                                    <span className={isSatisfied ? 'text-emerald-700' : 'text-amber-700'}>
                                                        {row.available}
                                                    </span>
                                                    <span className="font-normal text-slate-400"> / {row.quantity}</span>
                                                </p>
                                                <span
                                                    className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                        isSatisfied
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                                            : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                                    }`}
                                                >
                                                    {isSatisfied ? '✓ 数量充足' : `还缺 ${missing}`}
                                                </span>
                                            </div>
                                        </div>

                                        {/* 进度条 */}
                                        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                            <div
                                                className={`h-full rounded-full transition-all duration-300 ${
                                                    isSatisfied ? 'bg-emerald-500' : 'bg-amber-500'
                                                }`}
                                                style={{width: `${progress}%`}}
                                            />
                                        </div>
                                    </div>

                                    {/* 来源信息条 */}
                                    <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600">
                                        <div className="flex items-start gap-1.5">
                                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            {sources.length ? (
                                                <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 leading-5">
                                                    {sources.map(source => (
                                                        <span
                                                            key={`${source.monsterId}:${source.dungeonId}`}
                                                            className="inline-flex items-center gap-1"
                                                        >
                                                            <strong className="font-medium text-slate-800">
                                                                {source.monsterName}
                                                            </strong>
                                                            <span className="text-slate-500">
                                                                (Lv.{source.levelMin}～{source.levelMax})
                                                            </span>
                                                            <span className="text-slate-400">·</span>
                                                            <span className="text-slate-600">
                                                                {source.dungeonName}
                                                                {source.dungeonLevelMin !== undefined
                                                                    ? ` (需Lv.${source.dungeonLevelMin})`
                                                                    : ''}
                                                            </span>
                                                            {source.boundaryLevel !== null && (
                                                                <span className="rounded bg-amber-100/80 px-1 py-0.2 text-[10px] font-semibold text-amber-800">
                                                                    仅Lv.{source.boundaryLevel}相交
                                                                </span>
                                                            )}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="min-w-0 break-words text-slate-500">
                                                    {row.source || '迷宫怪物掉落'}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        同部位所有类型共用材料。可用数量已自动扣除其他未完成日程的预留保护。
                    </p>
                </section>
            </div>
        </article>
    );
}
