import type {MarketTickIssue} from './marketTickDetails';
import {marketOperationLabels} from './marketPresentation';

export function PlanTickFailures({issues}: {issues: MarketTickIssue[]}) {
    if (!issues.length) return null;
    return <details className="w-full rounded-lg bg-red-50 p-2 text-[11px] text-red-800">
        <summary className="cursor-pointer font-medium">查看 {issues.length} 笔失败操作</summary>
        <ul className="mt-2 space-y-2">{issues.map((issue, index) => <li key={index} className="break-words">
            <p>{marketOperationLabels[issue.kind] || issue.kind}{issue.quantity != null ? ` × ${issue.quantity}` : ''}{issue.item ? ` · ${issue.item}` : ''}</p>
            <p className="mt-0.5">{issue.reason}</p>
        </li>)}</ul>
    </details>;
}
