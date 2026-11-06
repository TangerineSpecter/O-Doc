import {useState} from 'react';
import {Info} from 'lucide-react';
import WorldDialog from './WorldDialog';
import {decisionProcessGuides} from './decisionProcessGuides';
import type {DecisionGuideKind} from './decisionProcessGuides';
import {DecisionProcessSteps} from './DecisionProcessSteps';

export function DecisionProcessInfo({kind}: {kind: DecisionGuideKind}) {
    const [open, setOpen] = useState(false);
    // 领域配置还描述不经过模型的后台维护，避免把到期下架误认为居民决策。
    const guide = decisionProcessGuides[kind];
    const description = kind === 'exploration'
        ? `${guide.subtitle}；历史保留与缺口处理见执行边界。` : kind === 'market' ? `${guide.subtitle}；用途目标每日复核，承诺去重保护；后台补扫与失败返还限频。` : guide.subtitle;
    return <>
        <button type="button" aria-label={`查看${guide.title}`} title={`${guide.title}：${guide.subtitle}`}
            aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40">
            <Info className="h-4 w-4" aria-hidden="true"/>
        </button>
        {open && <WorldDialog title={guide.title} description={description} size="wide" onClose={() => setOpen(false)}>
            <DecisionProcessSteps guide={guide}/>
        </WorldDialog>}
    </>;
}
