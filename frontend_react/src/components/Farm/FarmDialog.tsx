import {useEffect, useRef} from 'react';
import WorldDialog from '../AgentWorld/WorldDialog';
import FarmPanel from './FarmPanel';

export default function FarmDialog({initialAgentId, onClose}: {initialAgentId: string; onClose: () => void}) {
    const panel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        panel.current?.focus();
        const dialog = panel.current?.closest('[role="dialog"]');
        const trap = (event: KeyboardEvent) => {
            if (event.key !== 'Tab' || !dialog?.contains(event.target as Node)) return;
            const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]'));
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {event.preventDefault(); last?.focus();}
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {event.preventDefault(); first?.focus();}
        };
        dialog?.addEventListener('keydown', trap as EventListener);
        return () => {dialog?.removeEventListener('keydown', trap as EventListener); document.body.style.overflow = overflow;};
    }, []);
    return <WorldDialog title="像素农场" description="播种、照料，等待一场雨。看看居民今天怎样经营。" onClose={onClose} size="extra-wide">
        <div ref={panel} tabIndex={-1} className="w-full min-w-0"><FarmPanel initialAgentId={initialAgentId}/></div>
    </WorldDialog>;
}
