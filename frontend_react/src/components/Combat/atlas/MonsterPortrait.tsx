import {lazy, Suspense} from 'react';
import slimeImage from '../../../assets/combat/slime.svg';
import caveBatImage from '../../../assets/combat/cave-bat.svg';
import mossBeastImage from '../../../assets/combat/moss-beast.svg';
import mossKingImage from '../../../assets/combat/moss-king.svg';
import {getMonsterVisual} from './atlasIcons';
import {getMonsterPixelArt} from '../art/monsterPixelArt';
import type {MonsterHabitat} from './monsterHabitats';

const AnimatedMonsterPortrait = lazy(() => import('../animation/AnimatedMonsterPortrait'));

interface MonsterPortraitProps {
    monsterId: string;
    name?: string;
    rank?: string;
    animated?: boolean;
    decorative?: boolean;
    className?: string;
    fallbackClassName?: string;
    habitat?: MonsterHabitat;
    includeDraftArt?: boolean;
}

export function MonsterPortrait({
    monsterId, name, rank, animated = false, decorative = false,
    className = '', fallbackClassName = 'h-12 w-12', habitat, includeDraftArt = false,
}: MonsterPortraitProps) {
    const pixelArt = getMonsterPixelArt(monsterId, includeDraftArt);
    const visual = getMonsterVisual(monsterId, name, rank);
    const Icon = visual.icon;
    // Match the 256×224 fallback art to the 640×420 scene's feet position and actor scale.
    const framing = habitat ? 'absolute left-1/2 top-[21.4%] h-[61.3%] w-[46%] -translate-x-1/2' : 'h-full w-full';
    const isBat = monsterId === 'monster.cave_bat';
    const isMossBeast = monsterId === 'monster.moss_beast';
    const isMossKing = monsterId === 'monster.moss_king';
    // The 380×280 bat art uses the same ground anchor (.74) and scale (1.05) as its animation.
    const actorFraming = habitat && isMossKing
        // 490×350 art, ground anchor .74 and preview scale .96.
        ? 'absolute left-1/2 top-[0.86%] h-[80%] w-[73.5%] -translate-x-1/2'
        : habitat && isBat
        ? 'absolute left-1/2 top-[11.5%] h-[70%] w-[62.34%] -translate-x-1/2'
        : habitat && isMossBeast
            // 370×290 art, ground anchor .74 and preview scale 1.06.
            ? 'absolute left-1/2 top-[8.4%] h-[73.2%] w-[61.28%] -translate-x-1/2' : framing;
    const still = <img src={isMossKing ? mossKingImage : isMossBeast ? mossBeastImage : isBat ? caveBatImage : slimeImage}
        alt="" className={`${actorFraming} object-contain`} />;
    return <div
        className={`relative flex items-center justify-center overflow-hidden ${className}`}
        data-habitat-id={habitat?.dungeonId}
        role={decorative ? undefined : 'img'}
        aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : `${name || monsterId}形象`}
    >
        {habitat && <img src={habitat.image} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
        {pixelArt ? <img src={pixelArt} alt="" className={`${framing} object-contain p-[6%]`}
            style={{imageRendering: 'pixelated'}} />
            : monsterId === 'monster.slime' || isBat || isMossBeast || isMossKing
            ? animated ? <Suspense fallback={still}><AnimatedMonsterPortrait key={`${monsterId}:${Boolean(habitat)}`} monsterId={monsterId} inHabitat={Boolean(habitat)} fallback={still} /></Suspense> : still
            : <div className={`flex items-center justify-center ${framing}`}><Icon className={`${fallbackClassName} ${visual.color}`} /></div>}
    </div>;
}
