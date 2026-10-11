import {useEffect, useRef, useState} from 'react';
import {AuraReviewRenderer} from './AuraReviewRenderer';

export function useAuraReview(jobId: string, paused: boolean) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const renderer = useRef<AuraReviewRenderer | null>(null);
    const pause = useRef(paused); pause.current = paused;
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const node = canvas.current; if (!node) return;
        let disposed = false;
        const scene = new AuraReviewRenderer(node, jobId); renderer.current = scene; scene.paused = pause.current;
        const observer = new IntersectionObserver(entries => {scene.visible = entries[0].isIntersecting;}); observer.observe(node);
        void scene.start().then(() => {if (!disposed) setReady(true);}).catch(() => {if (!disposed) setError('形象暂时无法加载');});
        return () => {disposed = true; observer.disconnect(); scene.dispose(); renderer.current = null;};
    }, [jobId]);
    useEffect(() => {if (renderer.current) renderer.current.paused = paused;}, [paused]);
    return {canvas, error, ready};
}
