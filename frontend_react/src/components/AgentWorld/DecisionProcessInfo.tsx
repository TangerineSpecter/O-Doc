import {useState} from 'react';
import {Info} from 'lucide-react';
import WorldDialog from './WorldDialog';
import {decisionProcessGuides} from './decisionProcessGuides';
import type {DecisionGuideKind} from './decisionProcessGuides';
import {DecisionProcessSteps} from './DecisionProcessSteps';

export function DecisionProcessInfo({kind}: {kind: DecisionGuideKind}) {
    const [open, setOpen] = useState(false);
    // 同一入口展示完整领域流程，包括每日组队探索预约、资源预留与共同出发、小时市场装备摘要、可同步暂选续比、双戒指与主副手组合选择及完成比较后统一成交、自由活动概率抽签、独立决策、牧师系基础法杖及旧实例权限边界、组队加入与结算、倒地休整30分钟后满血、药剂数量的当前血蓝与最近单趟消耗摘要、携带红药时独立选档及同档采购、精英和Boss削弱及组队1.1/1.3/1.5倍难度与原奖励边界、双手剑吸血、不屈分档减伤及吟游诗人音律边界、过期收尾及中断恢复边界；大乐透逐位输入含本期下注统计与近三期开奖。
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
