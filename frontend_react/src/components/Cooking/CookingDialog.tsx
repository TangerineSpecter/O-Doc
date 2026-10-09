import {useState} from 'react';
import {ChefHat} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {ItemIconPicker} from '../AgentWorld/ItemIconPicker';
import {RecipeRuleEditor} from './RecipeRuleEditor';
import {RecipeDetails} from './RecipeDetails';
import {recipeStateLabels} from './recipePresentation';
import {useCooking} from '../../hooks/useCooking';
import type {CookingRecipe} from '../../types/api/cooking';
import type {CatalogItem} from '../../types/api/itemCatalog';

export default function CookingDialog({residents, initialAgentId = '', onClose}: {
    residents: {id: string; name: string}[]; initialAgentId?: string; onClose: () => void;
}) {
    const [agentId, setAgentId] = useState(residents.some(row => row.id === initialAgentId) ? initialAgentId : residents[0]?.id || '');
    const state = useCooking(agentId);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [selectedId, setSelectedId] = useState('');
    const [editing, setEditing] = useState<CookingRecipe | null>(null);
    const [image, setImage] = useState<CatalogItem | null>(null);
    const visible = (state.data?.recipes || []).filter(recipe => recipe.name.includes(search.trim()) && (filter === 'all' || recipe.state === filter));
    const selected = visible.find(recipe => recipe.id === selectedId) || visible[0];
    const skill = state.data?.skill;
    const openImage = (recipe: CookingRecipe) => setImage({id: recipe.sku, sku: recipe.sku, name: recipe.name, category: 'dish', description: recipe.description, purchasePrice: null, salePrice: Number(recipe.salePrice), quality: 'normal', quantity: 0, iconAssetId: recipe.iconAssetId, iconUrl: recipe.iconUrl});
    return <WorldDialog title="食谱图鉴" description="把田园收获变成美食，在制作中磨练厨艺。" size="wide" onClose={onClose}>
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex shrink-0 flex-wrap items-center gap-3">
                <div className="w-40"><Select menuPortal value={agentId} options={residents.map(row => ({value: row.id, label: row.name}))} onChange={id => {setAgentId(id); state.setPage(1);}} placeholder="选择居民"/></div>
                {skill && <div className="min-w-40 flex-1 text-xs text-slate-600"><p>厨艺 Lv.{skill.level} · 累计经验 {skill.experience}{skill.nextLevelExperience !== null ? ` / 升级需 ${skill.nextLevelExperience}` : ' · 已满级'}</p><div role="progressbar" aria-label="厨艺升级进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(skill.progress * 100)} className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-400" style={{width: `${skill.progress * 100}%`}}/></div></div>}
                <input aria-label="搜索食谱" placeholder="搜索菜名" value={search} onChange={e => setSearch(e.target.value)} className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm"/>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">{[{id: 'all', label: '全部'}, {id: 'ready', label: '可制作'}, {id: 'missing', label: '材料不足'}, {id: 'locked', label: '等级不足'}, {id: 'tired', label: '体力不足'}].map(tab => <button type="button" key={tab.id} aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)} className={`rounded-full px-3 py-1.5 text-xs ${filter === tab.id ? 'bg-white font-semibold text-orange-600 shadow-sm' : 'text-slate-500'}`}>{tab.label}</button>)}</div>
            {state.error && <p role="alert" className="shrink-0 text-sm text-red-600">{state.error} <button type="button" onClick={state.reload}>重试</button></p>}
            {state.loading ? <p className="p-6 text-center text-sm text-slate-500">正在翻开食谱…</p> : <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto scrollbar-hide md:grid-cols-2 md:overflow-hidden">
                <div className="min-h-0 space-y-2 md:overflow-y-auto scrollbar-hide">{visible.map(recipe => <button key={recipe.id} type="button" onClick={() => setSelectedId(recipe.id)} aria-pressed={selected?.id === recipe.id} className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left ${selected?.id === recipe.id ? 'border-orange-400' : 'border-slate-200'}`}><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-orange-50"><ItemIconImage src={recipe.iconUrl} alt={recipe.name} className="h-12 w-12" fallback={<ChefHat className="h-6 w-6 text-orange-300"/>}/></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">{recipe.name}</p><p className="mt-1 text-xs text-slate-500">Lv.{recipe.requiredLevel} · {recipeStateLabels[recipe.state]}</p></div><span className="text-sm font-semibold text-orange-600">{recipe.salePrice}</span></button>)}{!visible.length && <p className="p-6 text-center text-sm text-slate-400">没有符合条件的食谱</p>}</div>
                <div className="min-h-0 space-y-4 md:overflow-y-auto scrollbar-hide">{selected && <RecipeDetails recipe={selected} onImage={() => openImage(selected)} onEdit={() => setEditing(selected)}/>}
                    {state.history && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-sm font-semibold">制作记录</h3>{state.history.list.map(row => <div key={row.id} className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500"><p className="font-semibold text-slate-700">{row.snapshot.name} ×1 · 经验 +{row.result.experienceGained}{row.result.levelAfter > row.result.levelBefore ? ` · 升至 Lv.${row.result.levelAfter}` : ''}</p><p className="mt-1">{row.reason}</p><time className="mt-1 block">{new Date(row.createdAt).toLocaleString('zh-CN')}</time></div>)}{!state.history.list.length && <p className="mt-3 text-xs text-slate-400">还没有制作记录</p>}<div className="mt-3 flex items-center justify-between text-xs"><button disabled={state.page === 1} onClick={() => state.setPage(p => p - 1)} className="disabled:opacity-30">上一页</button><span>{state.page} / {Math.max(1, Math.ceil(state.history.total / 20))}</span><button disabled={state.page * 20 >= state.history.total} onClick={() => state.setPage(p => p + 1)} className="disabled:opacity-30">下一页</button></div></section>}
                </div>
            </div>}
        </div>
        {editing && <RecipeRuleEditor key={editing.id} recipe={editing} options={state.data?.ingredientOptions || []} onClose={() => setEditing(null)} onSaved={() => {setEditing(null); state.reload();}}/>}
        {image && <ItemIconPicker key={image.id} item={image} onClose={() => setImage(null)} onSaved={() => {setImage(null); state.reload();}}/>}
    </WorldDialog>;
}
