import {useCallback, useEffect, useRef, useState, type KeyboardEvent} from 'react';
import {useLocation} from 'react-router-dom';

export function useFloatingMenu() {
    const [openedAt, setOpenedAt] = useState<string | null>(null);
    const location = useLocation();
    const isOpen = openedAt === location.key;
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLElement>(null);
    const close = useCallback((restoreFocus = false) => {
        setOpenedAt(null);
        if (restoreFocus) triggerRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        panelRef.current?.querySelector<HTMLAnchorElement>('a')?.focus({preventScroll: true});
        const onPointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close();
        };
        const onFocus = (event: FocusEvent) => {
            if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('focusin', onFocus);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('focusin', onFocus);
        };
    }, [isOpen, close]);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!isOpen) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close(true);
            return;
        }
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        const links = Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
        if (!links.length) return;
        event.preventDefault();
        const current = links.indexOf(document.activeElement as HTMLAnchorElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links[next].focus();
    };

    return {isOpen, rootRef, triggerRef, panelRef, close, onKeyDown,
        toggle: () => setOpenedAt(value => value === location.key ? null : location.key)};
}
