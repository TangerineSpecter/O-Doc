import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {MonsterPortraitRenderer} from './MonsterPortraitRenderer';
import type {AnimatedMonsterId} from './MonsterPortraitRenderer';

export default function AnimatedMonsterPortrait({monsterId, inHabitat, fallback}: {
    monsterId: AnimatedMonsterId; inHabitat: boolean; fallback: ReactNode;
}) {
    const host = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (!host.current) return;
        let alive = true;
        const renderer = new MonsterPortraitRenderer(host.current, inHabitat, monsterId);
        void renderer.init().then(() => {
            if (alive) setReady(true);
        }).catch(() => {
            // The static portrait remains visible when WebGL is unavailable.
            renderer.dispose();
        });
        return () => { alive = false; renderer.dispose(); };
    }, [monsterId, inHabitat]);
    return <>
        <div className={`absolute inset-0 ${ready ? 'invisible' : ''}`}>{fallback}</div>
        <div ref={host} className={`pointer-events-none absolute inset-0 ${ready ? '' : 'invisible'}`} />
    </>;
}
