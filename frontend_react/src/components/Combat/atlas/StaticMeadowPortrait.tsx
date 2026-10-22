import {meadowPortraitFrame} from '../art/meadowPortraitFrame';
import type {MeadowMonsterId} from '../animation/meadowPixels/meadowTypes';
import slime from '../../../assets/combat/atlas-slime-idle.png';
import rabbit from '../../../assets/combat/atlas-fuzzy-ear-rabbit-idle.png';
import beetle from '../../../assets/combat/atlas-leafshell-beetle-idle.png';
import glowbug from '../../../assets/combat/atlas-dawnfire-glowbug-idle.png';

// Exported from getMeadowStill: loading and failed animations keep the same approved pixels.
const portraits: Record<MeadowMonsterId, string> = {
    'monster.slime': slime,
    'monster.fuzzy_ear_rabbit': rabbit,
    'monster.leafshell_beetle': beetle,
    'monster.dawnfire_glowbug': glowbug,
};

export function StaticMeadowPortrait({monsterId, inHabitat}: {
    monsterId: MeadowMonsterId; inHabitat: boolean;
}) {
    const frame = meadowPortraitFrame;
    // Match the animated actor's scale and 74% ground anchor in the 640×420 habitat.
    const framing = inHabitat ? {
        position: 'absolute' as const, left: '50%', transform: 'translateX(-50%)',
        top: `${100 * (.74 - frame.height * frame.ground * frame.habitatScale / 420)}%`,
        width: `${100 * frame.width * frame.habitatScale / 640}%`,
        height: `${100 * frame.height * frame.habitatScale / 420}%`,
    } : {width: '100%', height: '100%'};
    return <img src={portraits[monsterId]} alt="" draggable={false} className="object-contain"
        style={{...framing, imageRendering: 'pixelated'}} />;
}
