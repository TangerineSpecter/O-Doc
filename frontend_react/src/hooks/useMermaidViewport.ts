import {useLayoutEffect, useRef, useState} from 'react';

export const MIN_MERMAID_SCALE = 0.25;
export const MAX_MERMAID_SCALE = 3;
export const MERMAID_SCALE_STEP = 0.1;
export const normalizeMermaidScale = (value: number) =>
    Number(Math.min(MAX_MERMAID_SCALE, Math.max(MIN_MERMAID_SCALE, value)).toFixed(2));

/** Use SVG coordinates as the baseline, rather than Mermaid's CSS-constrained size. */
export function useMermaidViewport(svg: string, fullscreen: boolean) {
    const chartContentRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [chartSize, setChartSize] = useState({width: 0, height: 0});
    const [scale, setScaleValue] = useState(1);
    const manualScale = useRef(false);
    const autoScale = useRef(1);

    useLayoutEffect(() => {
        manualScale.current = false;
    }, [svg]);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const element = chartContentRef.current?.querySelector('svg');
        if (!svg || !viewport || !element) return;
        const width = element.viewBox.baseVal.width || element.getBoundingClientRect().width;
        const height = element.viewBox.baseVal.height || element.getBoundingClientRect().height;
        if (!width || !height) return;
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        element.style.maxWidth = 'none';
        setChartSize({width, height});

        const fit = () => {
            const style = getComputedStyle(viewport);
            const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            if (available <= 0) return;
            // Keep initial text at least its native size; long mobile diagrams can be swiped.
            const availableHeight = (fullscreen ? viewport.clientHeight : window.innerHeight * 0.7)
                - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
            autoScale.current = normalizeMermaidScale(Math.max(1, Math.min(available / width, availableHeight / height)));
            if (!manualScale.current) {
                setScaleValue(autoScale.current);
                viewport.scrollLeft = 0;
                viewport.scrollTop = 0;
            }
        };
        const handleWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            manualScale.current = true;
            const direction = event.deltaY < 0 ? 1 : -1;
            setScaleValue(current => normalizeMermaidScale(current + direction * MERMAID_SCALE_STEP));
        };
        viewport.addEventListener('wheel', handleWheel, {passive: false});
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(viewport);
        window.addEventListener('resize', fit);
        return () => {
            observer.disconnect();
            viewport.removeEventListener('wheel', handleWheel);
            window.removeEventListener('resize', fit);
        };
    }, [svg, fullscreen]);

    const setScale = (value: number | ((current: number) => number)) => {
        manualScale.current = true;
        setScaleValue(value);
    };
    const resetZoom = () => {
        manualScale.current = false;
        setScaleValue(autoScale.current);
        if (viewportRef.current) {
            viewportRef.current.scrollLeft = 0;
            viewportRef.current.scrollTop = 0;
        }
    };
    return {scale, setScale, chartSize, chartContentRef, viewportRef, resetZoom};
}
