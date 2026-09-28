import {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {InventoryBackpack} from './InventoryBackpack';
import {useAgentInventory} from '../../hooks/useAgentInventory';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

export function AgentInventoryDialog({agentId, name, onClose}: {agentId: string; name: string; onClose: () => void}) {
    const data = useAgentInventory(agentId);
    const panel = useRef<HTMLDivElement>(null);
    useEscapeDismissal(true, () => {onClose(); return true;});
    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        panel.current?.focus();
        return () => previous?.focus();
    }, []);
    return createPortal(<div className="inventory-backpack-modal">
        <button type="button" aria-label="关闭背包" className="inventory-backpack-backdrop" onClick={onClose}/>
        <div ref={panel} role="dialog" aria-modal="true" aria-label={`${name}的背包`} tabIndex={-1} className="inventory-backpack-dialog"
            onKeyDown={event => {
                if (event.key !== 'Tab') return;
                const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
                const first = buttons[0], last = buttons[buttons.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {event.preventDefault(); last?.focus();}
                else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {event.preventDefault(); first?.focus();}
            }}>
            <InventoryBackpack items={data.items} name={name} onClose={onClose} onRefresh={data.reload} loading={data.loading} error={data.error}/>
        </div>
    </div>, document.body);
}
