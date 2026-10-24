/** 与服务端升级曲线一致，让属性和钓鱼面板共享同一份本地成长。 */
export function fishingGrowthFor(index: number) {
    const level = [15, 40, 70, 99][index % 4];
    const floor = 100 * (level - 1) + 25 * (level - 1) * (level - 2) / 2;
    const progress = level === 99 ? 0 : 65;
    return {level, experience: floor + progress, progress, needed: level === 99 ? 0 : 100 + 25 * (level - 1)};
}

export function fishingSkillFor(index: number) {
    const {level, experience, progress, needed} = fishingGrowthFor(index);
    return {level, experience, levelExperience: progress,
        nextLevelExperience: needed ? experience - progress + needed : null,
        progress: needed ? progress / needed : 1};
}
