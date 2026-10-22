import {Check, ChevronRight} from 'lucide-react';
import type {BlacksmithRecipe} from '../../types/api/blacksmith';
import {MaterialPortrait} from '../Combat/atlas/MaterialPortrait';
import {BlacksmithEquipmentIcon} from './BlacksmithEquipmentIcon';
import {blacksmithStateLabels} from './blacksmithPresentation';

export function BlacksmithRecipeCard({recipe, selected, onClick}: {
    recipe: BlacksmithRecipe; selected: boolean; onClick: () => void;
}) {
    const preview = recipe.types.find(type => type.canEquip) || recipe.types[0];
    const missing = recipe.ingredients.filter(row => row.available < row.quantity).length;
    return <button type="button" aria-pressed={selected} onClick={onClick}
        className={`group w-full rounded-2xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${selected
            ? 'border-orange-300 bg-orange-50/50 ring-1 ring-inset ring-orange-200/60'
            : 'border-slate-200 bg-white hover:border-orange-200 hover:bg-slate-50/60'}`}>
        <span className="flex items-center gap-3">
            <BlacksmithEquipmentIcon slot={recipe.slot} equipmentId={preview?.templateId} equipmentType={preview?.equipmentType}
                name={preview?.name || recipe.slotName} className="h-14 w-14"/>
            <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-800">{recipe.slotName}</span>
                    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${recipe.state === 'ready'
                        ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{blacksmithStateLabels[recipe.state]}</span>
                </span>
                <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-600">{recipe.bandLabel}</span><span className="h-3 w-px bg-slate-200"/>
                    <span>{recipe.types.length} 种类型</span>
                </span>
            </span>
            <ChevronRight className={`h-4 w-4 shrink-0 ${selected ? 'text-orange-500' : 'text-slate-300 group-hover:text-slate-500'}`}/>
        </span>
        <span className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-slate-200/60 pt-2.5">
            {recipe.ingredients.map(row => <span key={row.sku} className="inline-flex min-w-0 items-center gap-1 text-[11px] text-slate-600">
                <MaterialPortrait materialId={row.sku.replace(/^combat\./, '')} name={row.name} decorative className="h-6 w-6 shrink-0 [&>svg]:h-5 [&>svg]:w-5"/>
                <span>{row.name}</span><span className="font-semibold tabular-nums text-slate-700">×{row.quantity}</span>
            </span>)}
        </span>
        <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            {missing ? <span>缺少 <span className="font-semibold text-amber-800">{missing}</span> 种材料</span>
                : <span className="inline-flex items-center gap-1 text-emerald-800"><Check className="h-3 w-3"/>材料齐备</span>}
            <span>{recipe.state === 'ready' ? `可打造 ${recipe.maxPieces} 件` : recipe.state === 'missing' ? '查看材料来源' : recipe.disabledReason}</span>
        </span>
    </button>;
}
