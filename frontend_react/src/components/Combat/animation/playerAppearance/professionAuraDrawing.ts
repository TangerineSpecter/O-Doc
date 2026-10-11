import type {ProfessionAuraId} from './layeredPlayerArt';
import {professionAuraProfiles} from '../../art/professionAuras';
import {drawProfessionMotif} from './professionAuraMotifs';

/** Continuous cosmetic ambience; no learned skill or combat state is triggered. */
export function drawProfessionAura(rear: CanvasRenderingContext2D, ground: CanvasRenderingContext2D,
    id: ProfessionAuraId, time: number) {
    const profile = professionAuraProfiles.find(p => p.id === id);
    if (profile) drawProfessionMotif(rear, ground, profile, time);
}
