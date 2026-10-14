export interface PlayerHandAnchors {
    left: {x: number; y: number};
    right: {x: number; y: number};
}

export const noviceHandAnchors: PlayerHandAnchors = {
    left: {x: 104, y: 417}, right: {x: 302, y: 417},
};

// Wrist registration in the normalized 374 × 528 frame. Clothing keeps its
// sleeve pixels; palms cover the source hand, never a rectangular cut-out.
const wrists: Record<string, [number, number, number, number]> = {
    novice: [104,417,302,417], mage: [99,417,305,417],
    elementalist: [102,417,303,417], pyromancer: [103,417,305,417],
    warrior: [76,430,306,430], swordsman: [77,430,309,430],
    guardian: [65,431,307,431], swordmaster: [80,431,311,431],
    spellblade: [65,431,307,431], paladin: [86,430,320,427],
    berserker: [68,427,328,427], ranger: [96,431,298,431],
    archer: [88,431,307,431], assassin: [100,431,304,431],
    sharpshooter: [93,431,312,431], hunter: [102,429,305,429],
    shadowdancer: [109,431,311,431], trickster: [99,431,297,431],
    priest: [88,428,306,428], cleric: [87,429,310,429],
    naturalist: [87,428,303,428], highpriest: [92,429,317,429],
    inquisitor: [92,427,314,427], druid: [89,430,307,430],
    warden: [84,427,309,427], occultist: [87,420,316,420],
    cryomancer: [79,419,322,419], warlock: [97,423,319,423],
    summoner: [78,421,321,421],
};

export function getPlayerHandAnchors(outfitId: string): PlayerHandAnchors {
    const row = wrists[outfitId.replace(/^job\./, '')];
    return row ? {left: {x: row[0], y: row[1]}, right: {x: row[2], y: row[3]}} : noviceHandAnchors;
}
