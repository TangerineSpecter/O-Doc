import {lazy, Suspense} from 'react';
import slimeImage from '../../../assets/combat/slime.svg';
import caveBatImage from '../../../assets/combat/cave-bat.svg';
import {getMonsterVisual} from './atlasIcons';
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
}

export function MonsterPortrait({
    monsterId, name, rank, animated = false, decorative = false,
    className = '', fallbackClassName = 'h-12 w-12', habitat,
}: MonsterPortraitProps) {
    const visual = getMonsterVisual(monsterId, name, rank);
    const Icon = visual.icon;
    // Match the 256×224 fallback art to the 640×420 scene's feet position and actor scale.
    const framing = habitat ? 'absolute left-1/2 top-[21.4%] h-[61.3%] w-[46%] -translate-x-1/2' : 'h-full w-full';
    const isBat = monsterId === 'monster.cave_bat';
    // The 380×280 bat art uses the same ground anchor (.74) and scale (1.05) as its animation.
    const actorFraming = habitat && isBat
        ? 'absolute left-1/2 top-[11.5%] h-[70%] w-[62.34%] -translate-x-1/2' : framing;
    const still = <img src={isBat ? caveBatImage : slimeImage} alt="" className={`${actorFraming} object-contain`} />;
    return <div
        className={`relative flex items-center justify-center overflow-hidden ${className}`}
        data-habitat-id={habitat?.dungeonId}
        role={decorative ? undefined : 'img'}
        aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : `${name || monsterId}形象`}
    >
        {habitat && <img src={habitat.image} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
        {monsterId === 'monster.slime' || monsterId === 'monster.cave_bat'
            ? animated ? <Suspense fallback={still}><AnimatedMonsterPortrait key={`${monsterId}:${Boolean(habitat)}`} monsterId={monsterId} inHabitat={Boolean(habitat)} fallback={still} /></Suspense> : still
            : <div className={`flex items-center justify-center ${framing}`}><Icon className={`${fallbackClassName} ${visual.color}`} /></div>}
    </div>;
}
