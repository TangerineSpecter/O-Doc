import {useEffect, useRef} from 'react';
import {registerEscapeDismissal} from '../utils/escapeDismissalRegistry';

/** Register an open modal or drawer with the shared, topmost-first Escape handler. */
export function useEscapeDismissal(
    isOpen: boolean,
    onEscape: () => boolean | void,
) {
    const onEscapeRef = useRef(onEscape);
    useEffect(() => {
        onEscapeRef.current = onEscape;
    }, [onEscape]);

    useEffect(() => {
        if (!isOpen) return;
        return registerEscapeDismissal(() => onEscapeRef.current());
    }, [isOpen]);
}
