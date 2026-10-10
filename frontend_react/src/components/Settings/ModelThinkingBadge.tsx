import type {AIModel} from '../../types/api/setting';
import {modelThinkingLabel} from '../../utils/modelThinkingLabel';

export function ModelThinkingBadge({model}: {model: AIModel}) {
    const mode = model.thinkingMode || 'default';
    const unconfirmed = mode !== 'default' && !model.thinkingCapability?.supported;
    const color = unconfirmed ? 'border-amber-200 bg-amber-50 text-amber-700'
        : mode === 'enabled' ? 'border-violet-200 bg-violet-50 text-violet-700'
        : 'border-slate-200 bg-slate-50 text-slate-500';
    const label = unconfirmed ? '思考待确认' : modelThinkingLabel(model);
    return <span title={modelThinkingLabel(model)} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 ${color}`}>
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-70"/>
        {label}
    </span>;
}
