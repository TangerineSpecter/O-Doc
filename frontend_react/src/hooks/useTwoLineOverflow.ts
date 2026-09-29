import {useEffect, useRef, useState} from 'react';

/** Measure unclipped text independently of the expansion button and visible preview. */
export default function useTwoLineOverflow(text: string) {
    const measurementRef = useRef<HTMLDivElement>(null);
    const [canExpand, setCanExpand] = useState(false);

    useEffect(() => {
        const element = measurementRef.current;
        if (!element) return;
        const measure = () => {
            const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
            if (element.clientWidth > 0 && Number.isFinite(lineHeight)) {
                setCanExpand(element.scrollHeight > Math.round(lineHeight * 2) + 1);
            }
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [text]);

    return {measurementRef, canExpand};
}
