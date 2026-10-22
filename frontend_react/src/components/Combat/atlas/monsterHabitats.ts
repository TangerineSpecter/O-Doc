import {battleBackgroundArt} from '../art/battleBackgroundArt';

export interface MonsterHabitat {
    dungeonId: string;
    image: string;
    feetRatio: number;
}

const habitats: Readonly<Record<string, MonsterHabitat>> = Object.fromEntries(
    Object.values(battleBackgroundArt)
        .filter(art => art.status === 'approved')
        .map(art => [art.id, {dungeonId: art.id, image: art.src, feetRatio: art.feetRatio}]),
);

/** Catalog IDs associate approved scenery with regular monsters and bosses alike. */
export function getMonsterHabitat(dungeonIds: readonly string[]): MonsterHabitat | undefined {
    return dungeonIds.map(id => habitats[id]).find(Boolean);
}
