import type {DailyFeedEvent} from '../../types/api/dailyFeed';

/** 同次执行的业务步骤保留在卡片内部，使用交易 ID 而非文案去重。 */
export function ExecutionFeedSteps({steps}: {steps: NonNullable<DailyFeedEvent['steps']>}) {
    return <ol aria-label="本次活动步骤" className="mt-3 max-h-60 space-y-2 overflow-y-auto scrollbar-hide rounded-lg border border-slate-100 bg-slate-50/60 p-3">
        {steps.map(step => <li key={step.id} className="flex items-start gap-2 text-xs leading-relaxed">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-sm bg-orange-300"/>
            <div className="min-w-0 flex-1"><span className="font-medium text-slate-700">{step.title}</span>{step.detail && <span className="ml-2 break-words text-slate-500">{step.detail}</span>}</div>
            <time dateTime={step.occurredAt} className="shrink-0 tabular-nums text-slate-400">{new Date(step.occurredAt).toLocaleTimeString('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit'})}</time>
        </li>)}
    </ol>;
}
