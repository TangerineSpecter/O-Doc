import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Fit the workbench inside Layout's navbar and its mobile bottom-bar padding. */
export function useQuantViewport() {
    const container = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number | undefined>();
    useLayoutEffect(() => {
        const element = container.current;
        if (!element) return;
        const update = () => {
            const top = element.getBoundingClientRect().top + window.scrollY;
            const padding = Number.parseFloat(getComputedStyle(element.parentElement!).paddingBottom) || 0;
            const available = Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight);
            const next = Math.max(0, Math.floor(available - Math.max(0, top) - padding));
            setHeight((previous) => (previous === next ? previous : next));
        };
        update();
        const observer = new ResizeObserver(update);
        if (element.parentElement?.previousElementSibling)
            observer.observe(element.parentElement.previousElementSibling);
        window.addEventListener('resize', update);
        window.visualViewport?.addEventListener('resize', update);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('resize', update);
        };
    }, []);
    const attach = useCallback((element: HTMLDivElement | null) => {
        container.current = element;
    }, []);
    return { attach, height };
}
