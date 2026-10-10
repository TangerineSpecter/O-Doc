import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {SlimePortraitRenderer} from './SlimePortraitRenderer';

export default function SlimePortrait({inHabitat, fallback}: {inHabitat: boolean; fallback: ReactNode}) {
    const host = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (!host.current) return;
        let alive = true;
        const renderer = new SlimePortraitRenderer(host.current, inHabitat);
        void renderer.init().then(() => {
            if (alive) setReady(true);
        }).catch(() => {
            // The static portrait remains visible when WebGL is unavailable.
            renderer.dispose();
        });
        return () => { alive = false; renderer.dispose(); };
    }, [inHabitat]);
    return <>
        <div className={`absolute inset-0 ${ready ? 'invisible' : ''}`}>{fallback}</div>
        <div ref={host} className={`pointer-events-none absolute inset-0 ${ready ? '' : 'invisible'}`} />
    </>;
}
