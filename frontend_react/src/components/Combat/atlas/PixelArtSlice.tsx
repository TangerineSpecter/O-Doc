import {playerSheetUrl, playerSheetSize} from '../art/playerVisuals';
import type {PlayerArtRegion} from '../art/playerVisuals';

/** CSS framing of the same PNG used by Pixi, without a renderer per thumbnail. */
export function PixelArtSlice({region, source = playerSheetUrl, size = playerSheetSize}: {
    region: PlayerArtRegion; source?: string; size?: {width: number; height: number};
}) {
    return <div className="relative h-full max-w-full overflow-hidden" style={{aspectRatio: `${region.width}/${region.height}`}}>
        <img src={source} alt="" draggable={false} className="pointer-events-none absolute max-w-none"
            style={{width: `${size.width / region.width * 100}%`,
                height: `${size.height / region.height * 100}%`,
                left: `${-region.x / region.width * 100}%`, top: `${-region.y / region.height * 100}%`,
                imageRendering: 'pixelated'}} />
    </div>;
}
