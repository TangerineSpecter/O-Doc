import {useState} from 'react';
import {BookOpen, Clock, Coins, ImagePlus, MapPin, Pencil, Sparkles, Zap} from 'lucide-react';
import {MaterialPortrait} from '../Combat/atlas/MaterialPortrait';
import {ElixirPortrait} from './ElixirPortrait';
import type {AlchemyHistory, AlchemyRecipe} from '../../types/api/alchemy';
import {alchemyStateConfigs, starTierClass} from './alchemyPresentation';

export function ElixirDetails({recipe, history, historyPage, onHistoryPageChange, residentName, onOpenImagePicker, onOpenRuleEditor}: {
    recipe: AlchemyRecipe; history: AlchemyHistory | null; historyPage: number;
    onHistoryPageChange: (page: number) => void; residentName?: string;
    onOpenImagePicker: () => void; onOpenRuleEditor: () => void;
}) {
    const [tab, setTab] = useState<'details' | 'history'>('details');
    const stateConfig = alchemyStateConfigs[recipe.state] || alchemyStateConfigs.unselected;
    const preview = recipe.qualityPreviews?.[0];
    const totalMade = history?.total || 0;

    return (
        <section aria-label="炼金配方详情" className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex gap-1 rounded-xl border border-slate-200/60 bg-slate-100 p-1">
                    {([{id: 'details', label: '配方与效果', icon: BookOpen}, {id: 'history', label: '制作记录', icon: Clock}] as const).map(item => {
                        const Icon = item.icon;
                        return <button key={item.id} type="button" onClick={() => setTab(item.id)}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all ${tab === item.id ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>
                            <Icon className="h-3.5 w-3.5" />{item.label}
                            {item.id === 'history' && totalMade > 0 && <span className="rounded-full bg-violet-100 px-1.5 text-[10px] text-violet-700">{totalMade}</span>}
                        </button>;
                    })}
                </div>
                {tab === 'details' && <div className="flex items-center gap-1.5">
                    <button type="button" onClick={onOpenImagePicker} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">
                        <ImagePlus className="h-3.5 w-3.5" />设置图片
                    </button>
                    <button type="button" onClick={onOpenRuleEditor} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">
                        <Pencil className="h-3.5 w-3.5" />编辑规则
                    </button>
                </div>}
            </div>

            {tab === 'details' ? (
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scrollbar-hide">
                    <div className="flex items-start gap-3">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-teal-50 p-1">
                            <ElixirPortrait recipe={recipe} className="h-full w-full"/>
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-bold text-slate-800">{recipe.name}</h3>
                                <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${stateConfig.badgeClass}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${stateConfig.dotClass}`} />{stateConfig.label}
                                </span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">{recipe.description}</p>
                            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-500">
                                <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3 text-violet-500" />已有 {recipe.ownedBottles} 瓶</span>
                                <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3 text-amber-500" />一星回收 {recipe.salePrice}</span>
                                <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3 text-sky-500" />每瓶 {recipe.energyCost} 体力</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">五档实际效果</span>
                            <span className="text-[10px] text-slate-400">按星级平铺</span>
                        </div>
                        <div className="space-y-1">
                            {recipe.effects.map((row, index) => <div key={row.stars}
                                className="flex items-start gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-1.5">
                                <span className={`inline-flex shrink-0 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${starTierClass[index] || starTierClass[0]}`}>
                                    {row.stars}★
                                </span>
                                <span className="min-w-0 flex-1 text-[11px] leading-5 text-slate-600">{row.summary}</span>
                            </div>)}
                        </div>
                        {preview && <p className="mt-2 text-[10px] text-slate-400">
                            当前等级预计：一星 {Math.round(preview.starProbabilities[0] * 100)}% · 三星 {Math.round(preview.starProbabilities[2] * 100)}% · 五星 {Math.round(preview.starProbabilities[4] * 100)}%
                        </p>}
                    </div>

                    <div>
                        <p className="mb-1.5 text-xs font-semibold text-slate-700">所需素材</p>
                        <div className="space-y-1.5">
                            {recipe.ingredients.map(row => {
                                const enough = row.owned >= row.quantity;
                                return <div key={row.sku} className={`flex items-center gap-2 rounded-xl border p-2 ${enough ? 'border-slate-200/80 bg-white' : 'border-amber-200/70 bg-amber-50/50'}`}>
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border p-0.5 ${enough ? 'border-slate-200/80 bg-slate-50/80' : 'border-amber-200/70 bg-white'}`}>
                                        <MaterialPortrait materialId={row.sku.replace(/^combat\./, '')} name={row.name} decorative className="h-full w-full"/>
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-xs font-medium text-slate-700">{row.name}</span>
                                        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                                            <span className="rounded bg-violet-50 px-1 py-0.5 font-semibold text-violet-600">{row.tier} 阶</span>
                                            {row.source && <span className="inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{row.source}</span>}
                                        </span>
                                    </span>
                                    <span className={`shrink-0 text-xs font-semibold tabular-nums ${enough ? 'text-slate-600' : 'text-amber-700'}`}>{row.owned}/{row.quantity}</span>
                                </div>;
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-2"><span className="text-slate-400">需求炼金等级</span><p className="mt-0.5 font-semibold text-slate-800">Lv.{recipe.requiredLevel}</p></div>
                        <div className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-2"><span className="text-slate-400">基础经验</span><p className="mt-0.5 font-semibold text-slate-800">{recipe.experience} EXP</p></div>
                        <div className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-2"><span className="text-slate-400">单次可制作</span><p className="mt-0.5 font-semibold text-slate-800">{recipe.maxBottles} 瓶</p></div>
                        <div className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-2"><span className="text-slate-400">累计制作</span><p className="mt-0.5 font-semibold text-slate-800">{recipe.timesMade} 瓶</p></div>
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-400">
                        炼金由居民生活日程自动执行，素材来自迷宫掉落；药水为一次性战斗消耗品，探索出发时最多携带 5 瓶，未使用部分结算返还。
                    </p>
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hide">
                    {!history?.list?.length ? <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-xs text-slate-400">
                        <Clock className="mb-2 h-8 w-8 text-slate-200" />还没有{residentName || '该居民'}的炼制记录
                    </div> : <div className="space-y-1.5">
                        {history.list.filter(row => row.recipeId === recipe.id).map(row => <div key={row.id} className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 text-[11px]">
                            <span className="font-semibold text-violet-700">★{row.result.stars || 1}</span>
                            <span className="text-slate-500">经验 +{row.result.experienceGained}</span>
                            <span className="text-slate-400">{new Date(row.createdAt).toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'})}</span>
                        </div>)}
                        {!history.list.some(row => row.recipeId === recipe.id) && <p className="py-8 text-center text-xs text-slate-400">本页没有该药水的记录</p>}
                    </div>}
                    {Boolean(history?.total) && <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>共 {history?.total} 条</span>
                        <div className="flex gap-1">
                            <button type="button" disabled={historyPage <= 1} onClick={() => onHistoryPageChange(historyPage - 1)} className="rounded-lg border border-slate-200 px-2 py-0.5 disabled:opacity-40">上一页</button>
                            <button type="button" disabled={(history?.list.length || 0) < 20} onClick={() => onHistoryPageChange(historyPage + 1)} className="rounded-lg border border-slate-200 px-2 py-0.5 disabled:opacity-40">下一页</button>
                        </div>
                    </div>}
                </div>
            )}
        </section>
    );
}
