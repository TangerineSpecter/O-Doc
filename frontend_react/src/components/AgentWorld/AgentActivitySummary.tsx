import {ChevronDown, ChevronUp} from 'lucide-react';
import useTwoLineOverflow from '../../hooks/useTwoLineOverflow';

export default function AgentActivitySummary({
    text, expanded, onExpandedChange, variant,
}: {
    text: string;
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    variant: 'interaction' | 'publication' | 'work';
}) {
    const {measurementRef, canExpand} = useTwoLineOverflow(text);
    const isPublication = variant === 'publication';
    const typography = `text-xs leading-[20px] ${isPublication ? 'text-slate-500' : `sm:text-sm sm:leading-[22px] ${variant === 'interaction' ? 'text-slate-700' : 'text-slate-600'}`}`;
    const collapsedHeight = variant === 'interaction'
        ? 'h-[40px] sm:h-[44px]'
        : `max-h-[40px] ${isPublication ? '' : 'sm:max-h-[44px]'}`;

    return (
        <div className={`relative ${isPublication ? 'mt-1' : ''}`}>
            <div ref={measurementRef} aria-hidden="true" className={`pointer-events-none invisible absolute inset-x-0 top-0 break-words ${typography}`}>
                {text}
            </div>
            <div className={`${typography} ${expanded ? 'whitespace-pre-wrap' : `${collapsedHeight} flow-root overflow-clip`}`}>
                {!expanded && canExpand && (
                    <>
                        <div className={`float-right h-[20px] w-0 ${isPublication ? '' : 'sm:h-[22px]'}`} />
                        <button
                            type="button"
                            aria-expanded={false}
                            onClick={event => { event.stopPropagation(); onExpandedChange(true); }}
                            className="float-right clear-both ml-1 inline-flex select-none items-center gap-0.5 text-[11px] font-medium text-orange-600 hover:text-orange-700"
                        >
                            <span>... 展开全文</span><ChevronDown className="h-3 w-3" />
                        </button>
                    </>
                )}
                <span className="break-words">{text}</span>
            </div>
            {expanded && (
                <div className="mt-1 flex justify-end">
                    <button
                        type="button"
                        aria-expanded={true}
                        onClick={event => { event.stopPropagation(); onExpandedChange(false); }}
                        className="inline-flex select-none items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-orange-600 transition-colors hover:bg-orange-100/60 hover:text-orange-700"
                    >
                        <span>收起</span><ChevronUp className="h-3 w-3" />
                    </button>
                </div>
            )}
        </div>
    );
}
