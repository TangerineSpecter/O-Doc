import {useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import type {MeadowMonsterId} from '../animation/meadowPixels/meadowTypes';

export function StaticMeadowPortrait({monsterId, inHabitat, fallback}: {
    monsterId: MeadowMonsterId; inHabitat: boolean; fallback: ReactNode;
}) {
    const [portrait, setPortrait] = useState<{id: string; src: string}>();
    useEffect(() => {
        let alive = true;
        void import('../art/meadowStillArt').then(({getMeadowStill}) => {
            const src = getMeadowStill(monsterId);
            if (alive) setPortrait({id: monsterId, src});
        }).catch(() => {});
        return () => { alive = false; };
    }, [monsterId]);
    if (portrait?.id !== monsterId) return fallback;
    // 160px frame × 2.2 in a 640×420 habitat; feet anchored at 74% height.
    const framing = inHabitat
        ? 'absolute left-1/2 top-[0.667%] h-[83.81%] w-[55%] -translate-x-1/2'
        : 'h-full w-full';
    return <img src={portrait.src} alt="" draggable={false} className={`${framing} object-contain`}
        style={{imageRendering: 'pixelated'}} />;
}
