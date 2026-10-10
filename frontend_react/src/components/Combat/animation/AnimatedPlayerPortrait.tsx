import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {PlayerPortraitRenderer} from './PlayerPortraitRenderer';

export default function AnimatedPlayerPortrait({jobId, fallback}: {jobId: string; fallback: ReactNode}) {
    const host = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (!host.current) return;
        let alive = true;
        const renderer = new PlayerPortraitRenderer(host.current, jobId);
        void renderer.init().then(() => { if (alive) setReady(true); }).catch(() => renderer.dispose());
        return () => { alive = false; renderer.dispose(); };
    }, [jobId]);
    return <>
        <div className={`absolute inset-0 ${ready ? 'invisible' : ''}`}>{fallback}</div>
        <div ref={host} className={`pointer-events-none absolute inset-0 ${ready ? '' : 'invisible'}`} />
    </>;
}
