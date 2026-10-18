import {Utensils} from 'lucide-react';
import type {CombatResult} from '../../types/api/combat';

export default function CombatFoodSummary({result, active = false}: {result: CombatResult; active?: boolean}) {
    const food = result.food;
    if (food === undefined && !result.foodAdjustment) return null;
    return (
        <div aria-label="冒险美食" className="rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-orange-800">
                <Utensils className="h-3.5 w-3.5 shrink-0" />
                <span>{food ? `★${food.stars} ${food.name} · 已消耗${food.quantity}份` : '本次未消耗美食'}</span>
                {food && <span className="text-[10px] font-normal text-slate-500">{active ? '本次冒险生效' : '效果已结束'}</span>}
            </div>
            {food && <p className="mt-1 leading-relaxed text-slate-600">{food.summary}</p>}
            {result.foodAdjustment && <p className="mt-1 leading-relaxed text-slate-500">{result.foodAdjustment}</p>}
        </div>
    );
}
