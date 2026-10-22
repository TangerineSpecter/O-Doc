import {useState} from 'react';
import {Plus, Trash2} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {MaterialPortrait} from '../Combat/atlas/MaterialPortrait';
import {updateBlacksmithRecipe} from '../../api/blacksmith';
import type {BlacksmithMaterial, BlacksmithRecipe, BlacksmithRulePatch} from '../../types/api/blacksmith';
import {allowedBlacksmithMaterials} from './blacksmithPresentation';

export function BlacksmithRuleEditor({recipe, materials, onClose, onSaved}: {
    recipe: BlacksmithRecipe; materials: BlacksmithMaterial[]; onClose: () => void; onSaved: () => void;
}) {
    const [ingredients, setIngredients] = useState<BlacksmithRulePatch['ingredients']>(recipe.ingredients.map(({sku, quantity}) => ({sku, quantity})));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const eligible = allowedBlacksmithMaterials(materials, recipe);
    const remaining = eligible.filter(row => !ingredients.some(item => item.sku === row.sku));
    const valid = ingredients.length > 0 && ingredients.every(row => Number.isSafeInteger(row.quantity) && row.quantity > 0 && row.quantity <= 9999);
    const save = async () => {
        if (!valid || busy) return;
        setBusy(true); setError('');
        try {await updateBlacksmithRecipe(recipe.id, {ingredients}); onSaved();}
        catch (failure) {setError(failure instanceof Error ? failure.message : '配方保存失败');}
        finally {setBusy(false);}
    };
    return <WorldDialog title="编辑打造配方" description={`${recipe.bandLabel} · ${recipe.slotName}`} closeDisabled={busy} onClose={onClose}>
        <div className="space-y-4">
            <p className="text-xs leading-relaxed text-slate-600">同等级档、同部位的所有类型共用此配方。修改只影响后续选择，已确认的打造及历史成品保留原规则。保存时核验材料与装备回收价值，避免循环获利。</p>
            <fieldset disabled={busy} className="space-y-3">
                <legend className="mb-2 text-sm font-semibold text-slate-800">每件装备消耗</legend>
                {ingredients.map((row, index) => <div key={`${row.sku}-${index}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                    <div className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white p-0.5">
                        <MaterialPortrait materialId={row.sku.replace(/^combat\./, '')} name={eligible.find(item => item.sku === row.sku)?.name}
                            decorative className="h-full w-full [&>svg]:h-6 [&>svg]:w-6"/>
                    </div>
                    <div className="min-w-0 flex-1"><Select menuPortal menuClassName="scrollbar-hide" value={row.sku}
                        options={eligible.filter(option => option.sku === row.sku || !ingredients.some(item => item.sku === option.sku))
                            .map(option => ({value: option.sku, label: `${option.name} · ${option.source}`}))}
                        onChange={sku => setIngredients(previous => previous.map((item, i) => i === index ? {...item, sku} : item))}/></div>
                    <input aria-label={`材料${index + 1}需求数量`} type="number" min={1} max={9999} value={row.quantity}
                        onChange={event => setIngredients(previous => previous.map((item, i) => i === index ? {...item, quantity: Number(event.target.value)} : item))}
                        className="w-14 shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-right text-sm tabular-nums sm:w-20"/>
                    <button type="button" aria-label="移除材料" disabled={ingredients.length <= 1}
                        onClick={() => setIngredients(previous => previous.filter((_, i) => i !== index))}
                        className="rounded-lg p-2 text-slate-500 disabled:opacity-40"><Trash2 className="h-4 w-4"/></button>
                </div>)}
                <button type="button" disabled={!remaining.length || ingredients.length >= 8} onClick={() => setIngredients(previous => [...previous, {sku: remaining[0].sku, quantity: 1}])}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 disabled:opacity-40"><Plus className="h-3.5 w-3.5"/>添加材料</button>
            </fieldset>
            {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
            {!valid && <p className="text-xs text-red-700">材料数量须为1～9,999之间的整数。</p>}
            <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">取消</button>
                <button type="button" disabled={busy || !valid} onClick={() => void save()} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? '正在保存…' : '保存配方'}</button></div>
        </div>
    </WorldDialog>;
}
