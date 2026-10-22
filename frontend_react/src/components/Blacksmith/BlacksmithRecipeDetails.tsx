import {Check, Info, MapPin, Package, Pencil, ShieldCheck, Zap} from 'lucide-react';
import type {BlacksmithMaterial, BlacksmithRecipe} from '../../types/api/blacksmith';
import {MaterialPortrait} from '../Combat/atlas/MaterialPortrait';
import {BlacksmithEquipmentIcon} from './BlacksmithEquipmentIcon';
import {blacksmithMaterialSources, blacksmithStateLabels} from './blacksmithPresentation';

export function BlacksmithRecipeDetails({recipe, materials, onEdit}: {recipe: BlacksmithRecipe; materials: BlacksmithMaterial[]; onEdit: () => void}) {
    const preview = recipe.types.find(type => type.canEquip) || recipe.types[0];
    const complete = recipe.ingredients.filter(row => row.available >= row.quantity).length;
    return <article aria-label="打造配方详情" className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <BlacksmithEquipmentIcon slot={recipe.slot} equipmentId={preview?.templateId} equipmentType={preview?.equipmentType}
                name={preview?.name || recipe.slotName} className="h-14 w-14 sm:h-16 sm:w-16"/>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold text-slate-800">{recipe.slotName}打造</h3>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{recipe.bandLabel}</span></div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3 text-amber-600"/>每件 {recipe.energyCost} 体力</span>
                    <span>免加工费</span><span>累计打造 {recipe.timesMade} 件</span>
                </p>
            </div>
            <button type="button" aria-label="编辑配方" onClick={onEdit} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700">
                <Pencil className="h-3.5 w-3.5"/><span className="hidden sm:inline">编辑配方</span></button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 scrollbar-hide">
            <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${recipe.state === 'ready' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>
                {recipe.state === 'ready' ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0"/> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400"/>}
                <span>{recipe.state === 'ready' ? `材料已齐备，当前最多可打造 ${recipe.maxPieces} 件` : recipe.disabledReason || blacksmithStateLabels[recipe.state]}</span>
            </div>
            <section aria-label="可打造装备">
                <div className="mb-2.5 flex items-center justify-between gap-2"><h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800"><ShieldCheck className="h-3.5 w-3.5 text-slate-400"/>可打造装备</h4>
                    <span className="text-[11px] text-slate-500">当前职业路线 · {recipe.types.length} 种</span></div>
                {recipe.types.length ? <ul className="flex flex-wrap gap-2">{recipe.types.map(type => <li key={type.templateId} className="flex min-w-0 flex-[1_1_180px] items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5">
                    <BlacksmithEquipmentIcon slot={recipe.slot} equipmentId={type.templateId} equipmentType={type.equipmentType} name={type.name} className="h-12 w-12"/>
                    <div className="min-w-0 flex-1"><p className="text-xs font-semibold leading-5 text-slate-800">{type.name}</p>
                        <p className="text-[11px] leading-5 text-slate-500">{type.typeName} · 随机 Lv.{type.levelMin}～{type.levelMax}</p>
                        <p className="text-[11px] leading-5 text-slate-500">{type.canEquip === false ? '路线后续可用 · ' : ''}穿戴 Lv.{type.wearLevel}</p>
                    </div>
                </li>)}</ul> : <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">当前没有适用的装备类型。选择已建立冒险档案的居民后，可查看其职业路线能够使用的类型。</p>}
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">成品等级在合法范围内随机，品质独立抽取；高于当前等级的装备先存入行囊。</p>
            </section>
            <section aria-label="打造所需材料">
                <div className="mb-2.5 flex items-center justify-between gap-2"><h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800"><Package className="h-3.5 w-3.5 text-slate-400"/>每件所需材料</h4>
                    <span className="text-[11px] text-slate-500">已齐备 {complete} / {recipe.ingredients.length} 种 · 可用 / 所需</span></div>
                <div className="space-y-2">{recipe.ingredients.map(row => {
                    const material = materials.find(item => item.sku === row.sku);
                    const sources = material ? blacksmithMaterialSources(material, recipe) : [];
                    const missing = Math.max(0, row.quantity - row.available);
                    return <div key={row.sku} className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80">
                        <div className="flex items-center gap-3 p-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 p-1">
                                <MaterialPortrait materialId={row.sku.replace(/^combat\./, '')} name={row.name} decorative className="h-full w-full [&>svg]:h-7 [&>svg]:w-7"/>
                            </div>
                            <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-800">{row.name}</p>
                                <p className="mt-1 text-[11px] tabular-nums text-slate-500">持有 {row.owned} · 已预留 {row.reserved}</p></div>
                            <div className="shrink-0 text-right"><p className="text-xs font-semibold tabular-nums text-slate-700">{row.available}<span className="font-normal text-slate-500"> / {row.quantity}</span></p>
                                <p className={`mt-1 text-[11px] tabular-nums ${missing ? 'text-red-700' : 'text-emerald-800'}`}>{missing ? `还缺 ${missing}` : '数量充足'}</p></div>
                        </div>
                        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                            <div className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400"/>
                                {sources.length ? <ul className="min-w-0 space-y-1.5 text-[11px] leading-5 text-slate-600">{sources.map(source => <li key={`${source.monsterId}:${source.dungeonId}`}>
                                    <span className="font-medium">{source.monsterName}</span><span className="text-slate-500"> · Lv.{source.levelMin}～{source.levelMax}</span>
                                    <span className="block text-slate-500">{source.dungeonName}{source.dungeonLevelMin !== undefined ? ` · 需 Lv.${source.dungeonLevelMin} 进入` : ''}</span>
                                    {source.boundaryLevel !== null && <span className="block text-amber-800">仅在 Lv.{source.boundaryLevel} 与本档相交</span>}
                                </li>)}</ul> : <p className="min-w-0 break-words text-[11px] leading-5 text-slate-500">{row.source || '迷宫怪物掉落'}</p>}
                            </div>
                        </div>
                    </div>;
                })}</div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">同部位所有类型共用材料。可用数量已扣除其他未完成日程的预留。</p>
            </section>
        </div>
    </article>;
}
