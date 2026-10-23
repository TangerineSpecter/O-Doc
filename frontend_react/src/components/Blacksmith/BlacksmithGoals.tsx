import type {BlacksmithRecipes} from '../../types/api/blacksmith';

export function BlacksmithGoals({goalState}: {goalState: BlacksmithRecipes['goalState'] | undefined}) {
    if (!goalState) return null;
    return <section aria-label="打造目标" className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
            <h3 className="text-xs font-semibold text-slate-800">打造目标 <span className="ml-1 font-normal tabular-nums text-slate-500">{goalState.goals.length}/3</span></h3>
            <span className="text-[11px] text-slate-500">可再登记 {goalState.freeSlots} 件 · 材料齐备 {goalState.readyCount} 件</span>
        </div>
        {goalState.goals.length ? <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">{goalState.goals.map(goal =>
            <div key={goal.id} className="min-w-0 rounded-xl border border-slate-200 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-slate-800">{goal.bandLabel} · {goal.slotName} · {goal.typeName}</span>
                    <span className={`shrink-0 ${goal.ready ? 'text-emerald-700' : 'text-orange-700'}`}>{goal.ready ? '可打造' : '收集中'}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                    {goal.ingredients.map(part => <span key={part.sku} className="whitespace-nowrap">{part.name} <span className="tabular-nums">{Math.min(part.available, part.required)}/{part.required}</span>{part.missing > 0 && <span className="text-orange-700"> · 差 {part.missing}</span>}</span>)}
                </div>
            </div>)}</div> : <p className="mt-1 text-[11px] text-slate-500">暂无待打造目标；居民可在铁匠铺活动中登记，不必填满三个位置。</p>}
        {goalState.invalidGoals?.length > 0 && <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            {goalState.invalidGoals.map(goal => <p key={goal.id}>已失效：{goal.recipeId} · {goal.templateId}。{goal.reason}</p>)}
        </div>}
    </section>;
}
