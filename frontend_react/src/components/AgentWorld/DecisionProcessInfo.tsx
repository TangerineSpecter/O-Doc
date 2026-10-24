import {useState} from 'react';
import {Info} from 'lucide-react';
import WorldDialog from './WorldDialog';
import {decisionProcessGuides} from './decisionProcessGuides';
import type {DecisionGuideKind} from './decisionProcessGuides';
import {DecisionProcessSteps} from './DecisionProcessSteps';

export function DecisionProcessInfo({kind}: {kind: DecisionGuideKind}) {
    const [open, setOpen] = useState(false);
    // 同一入口展示完整领域流程，包括独立决策、过期收尾与中断恢复边界。
    const guide = decisionProcessGuides[kind];
    return <>
        <button type="button" aria-label={`查看${guide.title}`} title={`${guide.title}：${guide.subtitle}`}
            aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40">
            <Info className="h-4 w-4" aria-hidden="true"/>
        </button>
        {open && <WorldDialog title={guide.title} description={guide.subtitle} size="wide" onClose={() => setOpen(false)}>
            <DecisionProcessSteps guide={guide}/>
        </WorldDialog>}
    </>;
}
