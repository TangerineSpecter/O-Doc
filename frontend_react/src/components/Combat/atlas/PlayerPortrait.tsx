import {lazy, Suspense} from 'react';
import {isPlayerJob, playerPortraitRegion} from '../art/playerVisuals';
import {getProfessionVisual} from './atlasIcons';
import {PixelArtSlice} from './PixelArtSlice';
import {hasProfessionArt} from '../art/professionAuras';
import {StaticPlayerPortrait} from './StaticPlayerPortrait';

const AnimatedPlayerPortrait = lazy(() => import('../animation/AnimatedPlayerPortrait'));

export function PlayerPortrait({jobId, name, animated = false, decorative = false,
    className = '', fallbackClassName = 'h-12 w-12', stage = 0}: {
    jobId: string; name?: string; animated?: boolean; decorative?: boolean;
    className?: string; fallbackClassName?: string; stage?: number | string;
}) {
    const visual = getProfessionVisual(jobId, name, undefined, stage);
    const Icon = visual.icon;
    const original = isPlayerJob(jobId)
        ? <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-full max-w-full" style={{aspectRatio: '200/224'}}>
                <div className="absolute left-[14.94%] top-[4.6%] flex h-[88.4%] w-[70.12%] justify-center">
                    <PixelArtSlice region={playerPortraitRegion(jobId)} />
                </div>
            </div>
        </div> : <Icon className={`${fallbackClassName} ${visual.color}`} />;
    const still=hasProfessionArt(jobId)?<StaticPlayerPortrait key={jobId} jobId={jobId} fallback={original}/>:original;
    return <div className={`relative flex items-center justify-center overflow-hidden ${className}`}
        data-player-art-id={jobId} role={decorative ? undefined : 'img'}
        aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${name || jobId}形象`}>
        {animated && hasProfessionArt(jobId)
            ? <Suspense fallback={still}><AnimatedPlayerPortrait key={jobId} jobId={jobId} fallback={still} /></Suspense>
            : still}
    </div>;
}
