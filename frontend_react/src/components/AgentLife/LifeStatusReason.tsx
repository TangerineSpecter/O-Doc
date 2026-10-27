import type {LifeItem} from '../../types/api/agentLife';
import {lifeStatusReason} from './lifeReasonText';

export function LifeStatusReason({item}: {item: LifeItem}) {
    const reason = lifeStatusReason(item);
    if (!reason) return null;
    return <p className="mt-1.5 pl-1.5 text-[10px] leading-relaxed text-amber-800" title={reason.text}>
        <span className="font-semibold">{reason.label}：</span>{reason.text}
    </p>;
}
