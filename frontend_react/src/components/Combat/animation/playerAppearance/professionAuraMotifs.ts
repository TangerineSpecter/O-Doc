import type {ProfessionAuraProfile} from '../../art/professionAuras';
import {auraArc, auraSpark, drawAuraAtmosphere, tau} from './auraDrawingPrimitives';
import type {AuraContext} from './auraDrawingPrimitives';
import {drawWarriorAura} from './warriorAuraDrawing';
import {drawArcaneAura} from './arcaneAuraDrawing';
import {drawRangerAura} from './rangerAuraDrawing';
import {drawHolyNatureAura} from './holyNatureAuraDrawing';
import {drawCryomancerSnow} from './cryomancerSnowDrawing';

const martial = new Set(['warrior', 'swordsman', 'guardian', 'swordmaster', 'spellblade', 'berserker']);
const arcane = new Set(['mage', 'elementalist', 'occultist', 'flame', 'warlock', 'summoner']);
const wild = new Set(['ranger', 'archer', 'assassin', 'sharpshooter', 'hunter', 'shadowdancer', 'trickster']);

/** Every aura shares soft ambience, while its main silhouette and motion belong to the job. */
export function drawProfessionMotif(rear: AuraContext, floor: AuraContext, p: ProfessionAuraProfile, time: number) {
    if (p.id === 'cryomancer') {drawCryomancerSnow(rear, floor, time, p.color, p.light); return;}
    drawAuraAtmosphere(rear, floor, p, time);
    if (martial.has(p.id)) drawWarriorAura(rear, floor, p, time);
    else if (arcane.has(p.id)) drawArcaneAura(rear, floor, p, time);
    else if (wild.has(p.id)) drawRangerAura(rear, floor, p, time);
    else if (p.id !== 'novice') drawHolyNatureAura(rear, floor, p, time);
    else {
        auraArc(floor, 0, 6, 153, 28, time * .24, 1.5, p, .4);
        for (let i = 0; i < 3; i++) {
            const a = time * .3 + i * tau / 3;
            auraSpark(rear, Math.cos(a) * 204, -200 + Math.sin(a) * 110, 8, p, .55);
        }
    }
}
