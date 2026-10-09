import {useState} from 'react';
import {Plus, Trash2} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {updateCookingRecipe} from '../../api/cooking';
import type {CookingRecipe, RecipeRule} from '../../types/api/cooking';

export function RecipeRuleEditor({recipe, options, onClose, onSaved}: {
    recipe: CookingRecipe; options: {sku: string; name: string}[]; onClose: () => void; onSaved: () => void;
}) {
    const [rule, setRule] = useState<RecipeRule>({ingredients: recipe.ingredients.map(({sku, quantity}) => ({sku, quantity})),
        requiredLevel: recipe.requiredLevel, salePrice: recipe.salePrice, experience: recipe.experience, energyCost: recipe.energyCost});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const save = async () => {
        setBusy(true); setError('');
        try {await updateCookingRecipe(recipe.id, rule); onSaved();}
        catch (e) {setError(e instanceof Error ? e.message : '保存失败');}
        finally {setBusy(false);}
    };
    const available = options.filter(option => !rule.ingredients.some(row => row.sku === option.sku));
    return <WorldDialog title="编辑食谱规则" description={recipe.name} onClose={() => {if (!busy) onClose();}}>
        <div className="space-y-4">
            <p className="text-xs text-slate-500">每次制作一份；修改只影响后续制作，已有成品保持原回收价格。</p>
            <fieldset disabled={busy} className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">每份材料</legend>
                {rule.ingredients.map((row, index) => <div key={index} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1"><Select menuPortal menuClassName="scrollbar-hide" value={row.sku} options={options.filter(option => option.sku === row.sku || !rule.ingredients.some(other => other.sku === option.sku)).map(option => ({value: option.sku, label: option.name}))} onChange={sku => setRule({...rule, ingredients: rule.ingredients.map((old, i) => i === index ? {...old, sku} : old)})}/></div>
                    <input aria-label={`材料${index + 1}数量`} type="number" min={1} max={1000000} value={row.quantity} onChange={e => setRule({...rule, ingredients: rule.ingredients.map((old, i) => i === index ? {...old, quantity: Number(e.target.value)} : old)})} className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm"/>
                    <button type="button" disabled={rule.ingredients.length === 1} aria-label="移除材料" onClick={() => setRule({...rule, ingredients: rule.ingredients.filter((_, i) => i !== index)})} className="rounded-lg p-2 text-slate-500 disabled:opacity-30"><Trash2 size={16}/></button>
                </div>)}
                <button type="button" disabled={!available.length} onClick={() => setRule({...rule, ingredients: [...rule.ingredients, {sku: available[0].sku, quantity: 1}]})} className="flex items-center gap-1 text-xs text-orange-600"><Plus size={14}/>添加材料</button>
                <div className="grid grid-cols-2 gap-3">
                    {([{key: 'requiredLevel', label: '要求等级', max: 99}, {key: 'experience', label: '基础经验', max: 1000000}, {key: 'energyCost', label: '每份体力', max: 100}] as const).map(field => <label key={field.key} className="space-y-1 text-xs text-slate-600"><span>{field.label}</span><input type="number" min={1} max={field.max} value={rule[field.key]} onChange={e => setRule({...rule, [field.key]: Number(e.target.value)})} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"/></label>)}
                    <label className="space-y-1 text-xs text-slate-600"><span>一星回收单价</span><input type="number" min="0.01" max={1000000} step="0.01" value={rule.salePrice} onChange={e => setRule({...rule, salePrice: e.target.value})} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"/></label>
                </div>
            </fieldset>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end"><button disabled={busy} type="button" onClick={() => void save()} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? '正在保存…' : '保存规则'}</button></div>
        </div>
    </WorldDialog>;
}
