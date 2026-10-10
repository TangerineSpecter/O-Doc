import mossCaveImage from '../../../assets/combat/moss-cave.svg';

export interface MonsterHabitat {
    dungeonId: string;
    image: string;
}

const habitats: Readonly<Record<string, MonsterHabitat>> = {
    'dungeon.moss_cave': {dungeonId: 'dungeon.moss_cave', image: mossCaveImage},
};

/** Catalog IDs associate scenery with regular monsters and bosses alike. */
export function getMonsterHabitat(dungeonIds: readonly string[]): MonsterHabitat | undefined {
    return dungeonIds.map(id => habitats[id]).find(Boolean);
}
