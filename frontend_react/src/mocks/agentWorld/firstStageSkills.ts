import type {CombatCatalog, CombatProfile} from '../../types/api/combat';

// The standard local residents are all first-promotion characters. Build their
// skills from the same catalog and rank thresholds shown by the atlas.
export function firstStageSkills(catalog: CombatCatalog, job: string, level: number): CombatProfile['skills'] {
    const {skills, skillLevels, skillEffects} = catalog.tables;
    return skills.filter(skill => skill.professionId === job && skill.enabled === '1' && Number(skill.learnLevel) <= level)
        .flatMap(skill => {
            const rank = skillLevels.filter(row => row.skillId === skill.id && Number(row.requiredLevel) <= level)
                .sort((a, b) => Number(b.rank) - Number(a.rank))[0];
            if (!rank) return [];
            const currentCost = Math.max(1, Math.ceil((Number(rank.costBase) + Number(rank.costPerLevel) * level) * Number(rank.costRankFactor)));
            return [{...skill, rank: Number(rank.rank), parameters: {...rank, currentCost: String(currentCost)},
                effects: skillEffects.filter(effect => effect.skillLevelId === rank.id)}];
        }) as unknown as CombatProfile['skills'];
}
