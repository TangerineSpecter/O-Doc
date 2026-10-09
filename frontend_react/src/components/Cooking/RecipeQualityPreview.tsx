import {useState} from 'react';
import {Sparkles} from 'lucide-react';
import {Select} from '../common/Select';
import type {CookingRecipe, IngredientStrategy} from '../../types/api/cooking';

const strategies: {id: IngredientStrategy; label: string; hint: string}[] = [
    {id: 'low_stars_first', label: '日常制作', hint: '低星优先，同星先进先出'},
    {id: 'high_stars_first', label: '精品制作', hint: '高星优先，同星先进先出'},
];
const money = (value: string | number) => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 2});

/** Read-only strategy comparison; the resident chooses when their cooking activity runs. */
export function RecipeQualityPreview({recipe}: {recipe: CookingRecipe}) {
    const [strategy, setStrategy] = useState<IngredientStrategy>('low_stars_first');
    const [portion, setPortion] = useState(0);
    const preview = recipe.qualityPreviews?.find(row => row.ingredientStrategy === strategy);
    const estimate = preview?.portions[Math.min(portion, preview.portions.length - 1)];
    if (!estimate) return null;
    const selected = strategies.find(row => row.id === strategy)!;
    const gain = Number(estimate.expectedProcessingGain);
    return <section className="space-y-3 rounded-2xl border border-orange-200/70 bg-orange-50/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1 text-xs font-bold text-slate-800"><Sparkles size={14} className="text-orange-500"/>制作品质预览</h4>
            <div className="flex rounded-full bg-slate-100 p-1" aria-label="材料策略预览">
                {strategies.map(row => <button type="button" key={row.id} aria-pressed={strategy === row.id}
                    onClick={() => {setStrategy(row.id); setPortion(0);}}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${strategy === row.id ? 'bg-white text-orange-600 shadow-xs' : 'text-slate-500'}`}>{row.label}</button>)}
            </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">{selected.hint} · 材料均星 {Number(estimate.materialStars).toFixed(2)}</p>
            {(preview?.portions.length ?? 0) > 1 && <div className="w-28"><Select menuPortal menuClassName="scrollbar-hide" value={String(portion)}
                options={preview!.portions.map((_, index) => ({value: String(index), label: `第 ${index + 1} 份材料`}))}
                onChange={value => setPortion(Number(value))}/></div>}
        </div>
        <div className="flex flex-wrap gap-1.5">
            {estimate.materials.map((row, index) => <span key={`${row.inventoryId}-${index}`} className="rounded-lg border border-slate-200/70 bg-white px-2 py-1 text-[10px] text-slate-600">
                {recipe.ingredients.find(ingredient => ingredient.sku === row.sku)?.name || row.sku} ★{row.stars} ×{row.quantity}
            </span>)}
        </div>
        <div className="grid grid-cols-5 gap-1 text-center" aria-label="成品星级概率">
            {estimate.starProbabilities.map((probability, index) => <div key={index} className="rounded-xl border border-amber-100 bg-white px-1 py-2">
                <p className="text-[11px] font-bold text-amber-700">★{index + 1}</p>
                <p className="mt-1 text-[10px] font-semibold text-slate-700">{probability < .00001 ? '<0.001' : (probability * 100).toFixed(2)}%</p>
                <p className="mt-1 text-[10px] text-slate-500">{money(estimate.starValues[index])} 币</p>
                <p className="text-[10px] text-slate-400">+{estimate.starExperiences[index]} EXP</p>
            </div>)}
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-white p-2"><p className="text-slate-500">原料机会成本</p><p className="mt-1 font-bold text-slate-700">{money(estimate.ingredientValue)} 币</p></div>
            <div className="rounded-xl bg-white p-2"><p className="text-slate-500">预期加工差额</p><p className={`mt-1 font-bold ${gain < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{gain > 0 ? '+' : ''}{money(gain)} 币</p></div>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">预期回收 {money(estimate.expectedRevenue)} 币 · 预期经验 {money(estimate.expectedExperience)}。按当前厨艺估算，每份制作采用当时等级；预览不执行制作，由居民在日程中自主选择。挂牌溢价未计入。</p>
    </section>;
}
