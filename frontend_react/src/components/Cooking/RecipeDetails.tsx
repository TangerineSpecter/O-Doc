import {ChefHat, ImagePlus, Pencil} from 'lucide-react';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import type {CookingRecipe} from '../../types/api/cooking';
import {recipeStateLabels} from './recipePresentation';

export function RecipeDetails({recipe, onImage, onEdit}: {recipe: CookingRecipe; onImage: () => void; onEdit: () => void}) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-orange-50"><ItemIconImage src={recipe.iconUrl} alt={recipe.name} className="h-24 w-24" fallback={<ChefHat className="h-10 w-10 text-orange-300"/>}/></div><div className="min-w-0"><h3 className="text-lg font-bold text-slate-800">{recipe.name}</h3><p className="mt-1 text-sm font-semibold text-orange-600">回收单价 {recipe.salePrice}</p><p className="mt-1 text-xs text-slate-500">要求 Lv.{recipe.requiredLevel} · {recipeStateLabels[recipe.state]}</p></div></div>
        <div className="mt-4 flex gap-2"><button type="button" onClick={onImage} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs"><ImagePlus size={14}/>设置图片</button><button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs"><Pencil size={14}/>编辑规则</button></div>
        <h4 className="mt-5 text-sm font-semibold">每份材料</h4><ul className="mt-2 space-y-2">{recipe.ingredients.map(row => <li key={row.sku} className="flex justify-between gap-2 text-sm"><span>{row.name} ×{row.quantity}</span><span className={row.owned < row.quantity ? 'text-amber-600' : 'text-slate-500'}>持有 {row.owned}</span></li>)}</ul>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600"><p>每份经验 +{recipe.experience} · 消耗体力 {recipe.energyCost}</p><p>可制作 {recipe.maxPortions} 份 · 已制作 {recipe.timesMade} 份</p><p>当前原料回收价值 {recipe.ingredientValue} · 加工差额 {recipe.processingGain}</p></div>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">{recipe.description}</p>
    </section>;
}
