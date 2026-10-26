import {now, residents} from './residents';
import type {DuelParticipant, DuelRound, TournamentDetail, TournamentMatch, TournamentMatchDetail, TournamentOverview, TournamentReward, TournamentRound} from '../../types/api/tournament';

// Keep the whole bracket coherent and relative to the current Shanghai week.
const day = now.toLocaleDateString('en-CA', {timeZone: 'Asia/Shanghai'});
const today = new Date(`${day}T14:00:00+08:00`).getTime();
const weekday = new Date(today + 8 * 3600000).getUTCDay();
const sunday = today - weekday * 86400000;
const at = (offset: number) => new Date(sunday + offset * 86400000).toISOString();
const week = (offset: number) => new Date(sunday + offset * 86400000 + 8 * 3600000).toISOString().slice(0, 10);

export const tournamentReports = new Map<string, TournamentMatchDetail>();

// 80 位特色居民全名单
const extraNames = [
    '小橘', '林芽', '星河', '白露', '青竹', '紫苏', '墨羽', '风行',
    '晓月', '晴空', '云舒', '岚峰', '秋水', '赤羽', '玄冰', '流火',
    '惊雷', '暮雪', '朝阳', '幽夜', '苍松', '翠微', '灵溪', '飞泉',
    '明霜', '丹霞', '冷月', '清微', '逐日', '凌霄', '玄霄', '幻月',
    '寒星', '流云', '惊鸿', '落枫', '破浪', '疾风', '听雨', '问剑',
    '踏雪', '醉月', '归云', '鸣泉', '浮光', '掠影', '朔风', '绝尘',
    '银霜', '烈焰', '残阳', '紫烟', '寒江', '青锋', '斩风', '追影',
    '破阵', '摧城', '止戈', '镇岳', '天枢', '天璇', '天玑', '天权',
    '玉衡', '开阳', '摇光', '太阿', '龙渊', '湛卢', '纯钧', '巨阙',
    '承影', '干将', '莫邪', '青霜', '含光', '宵练', '承云', '灵岳',
];

const professions = ['狂战剑士', '疾风游侠', '秘法魔导师', '圣光祈福师', '暗影潜伏者', '磐石御灵者', '烈焰术士', '神射手'];

export interface TournamentActor {
    id: string;
    name: string;
    avatar?: string;
    level: number;
    profession: string;
    stats: Record<string, number>;
}

export const mockTournamentActors: TournamentActor[] = extraNames.map((name, i) => ({
    id: i < residents.length ? residents[i].id : `local-resident-${i + 1}`,
    name,
    avatar: i < residents.length ? residents[i].avatar : '',
    level: 18 + (i % 12),
    profession: professions[i % professions.length],
    stats: {
        hpMax: 360 + (i % 8) * 15,
        mpMax: 140 + (i % 6) * 10,
        physicalAttack: 58 + (i % 9) * 4,
        magicAttack: 52 + (i % 7) * 4,
        physicalDefense: 30 + (i % 5) * 3,
        magicDefense: 28 + (i % 5) * 3,
        speed: 22 + (i % 8) * 2,
    },
}));

const actorMap = new Map(mockTournamentActors.map(a => [a.id, a]));

function buildParticipant(actorId: string): DuelParticipant {
    const actor = actorMap.get(actorId) || mockTournamentActors[0];
    return {
        actorId: actor.id,
        name: actor.name,
        avatar: actor.avatar || '',
        level: actor.level,
        profession: actor.profession,
        stats: {...actor.stats},
        skills: {strike: 2, flurry: 1},
    };
}

function createMatch(
    eventId: string,
    roundNum: number,
    matchNum: number,
    leftId: string,
    rightId: string | null,
    winnerId: string | null,
    scheduledAt: string,
    kind: 'main' | 'bronze' = 'main',
    customReason?: string,
): TournamentMatch {
    const id = `${eventId}-r${roundNum}-m${matchNum}`;
    const isBye = rightId === null || rightId === '';
    const actualRightId = isBye ? '' : rightId!;
    const actualWinner = isBye ? leftId : winnerId;
    const loserId = isBye ? '' : (actualWinner === leftId ? actualRightId : leftId);
    const reason = isBye ? 'bye' : (customReason || 'knockout');

    const matchRow: TournamentMatch = {
        id,
        number: matchNum,
        kind,
        leftId,
        rightId: actualRightId,
        status: actualWinner ? 'done' : 'pending',
        playedAt: actualWinner ? scheduledAt : null,
        result: actualWinner ? {winnerId: actualWinner, loserId, reason} : {},
    };

    const report: TournamentMatchDetail['report'] = {};
    if (!isBye && actualWinner) {
        report.participants = [buildParticipant(leftId), buildParticipant(actualRightId)];
        const winner = actorMap.get(actualWinner)!;
        const loser = actorMap.get(loserId)!;

        report.rounds = [1, 2, 3].map((rNum): DuelRound => {
            const isFinalRound = rNum === 3;
            const dmg1 = 110 + (rNum * 15);
            const dmg2 = 65 + (rNum * 10);
            return {
                number: rNum,
                overtime: false,
                order: [winner.id, loser.id],
                events: [
                    {actor: winner.id, target: loser.id, action: rNum === 2 ? '烈风斩' : '普通攻击', kind: 'damage', damage: dmg1, hit: true, critical: rNum === 3},
                    ...(isFinalRound ? [] : [{actor: loser.id, target: winner.id, action: '迅捷反击', kind: 'damage', damage: dmg2, hit: true}]),
                ],
                resources: [
                    {actorId: winner.id, hp: Math.max(80, winner.stats.hpMax - rNum * 60), mp: Math.max(20, winner.stats.mpMax - rNum * 25)},
                    {actorId: loser.id, hp: isFinalRound ? 0 : Math.max(50, loser.stats.hpMax - rNum * 115), mp: Math.max(10, loser.stats.mpMax - rNum * 30)},
                ],
            };
        });
    }

    tournamentReports.set(id, {...matchRow, report});
    return matchRow;
}

// 构造 80 人的完整淘汰赛（含预选附加赛与正赛）
function generate80Bracket(): {rounds: TournamentRound[]; podium: Record<string, string>; bronzeCandidates: string[]} {
    const eventId = 'local-tournament-current';
    const all = mockTournamentActors.map(a => a.id); // 80 IDs

    // === Round 1: 资格预选附加轮 (Phase: preliminary, 80 人 -> 40 人) ===
    // 80 进 40，共 40 场
    const r1Winners: string[] = [];
    const r1Matches: TournamentMatch[] = [];
    for (let i = 0; i < 40; i++) {
        const left = all[i * 2];
        const right = all[i * 2 + 1];
        // 胜者交替选择，确保头部角色（小橘、林芽、星河等）进入正赛
        const winner = i < 4 ? left : (i % 2 === 0 ? left : right);
        r1Winners.push(winner);
        r1Matches.push(createMatch(eventId, 1, i + 1, left, right, winner, at(0)));
    }
    const round1: TournamentRound = {
        id: `${eventId}-round-1`,
        number: 1,
        entrantCount: 80,
        phase: 'preliminary',
        scheduledAt: at(0),
        completedAt: at(0),
        status: 'done',
        matches: r1Matches,
    };

    // === Round 2: 正赛第一轮 (40 强赛，40 进 20) ===
    const r2Winners: string[] = [];
    const r2Matches: TournamentMatch[] = [];
    for (let i = 0; i < 20; i++) {
        const left = r1Winners[i * 2];
        const right = r1Winners[i * 2 + 1];
        const winner = i < 4 ? left : (i % 2 === 0 ? left : right);
        r2Winners.push(winner);
        r2Matches.push(createMatch(eventId, 2, i + 1, left, right, winner, at(1)));
    }
    const round2: TournamentRound = {
        id: `${eventId}-round-2`,
        number: 2,
        entrantCount: 40,
        phase: 'main',
        scheduledAt: at(1),
        completedAt: at(1),
        status: 'done',
        matches: r2Matches,
    };

    // === Round 3: 正赛第二轮 (20 强赛，20 进 10) ===
    const r3Winners: string[] = [];
    const r3Matches: TournamentMatch[] = [];
    for (let i = 0; i < 10; i++) {
        const left = r2Winners[i * 2];
        const right = r2Winners[i * 2 + 1];
        const winner = i < 3 ? left : (i % 2 === 0 ? left : right);
        r3Winners.push(winner);
        r3Matches.push(createMatch(eventId, 3, i + 1, left, right, winner, at(2)));
    }
    const round3: TournamentRound = {
        id: `${eventId}-round-3`,
        number: 3,
        entrantCount: 20,
        phase: 'main',
        scheduledAt: at(2),
        completedAt: at(2),
        status: 'done',
        matches: r3Matches,
    };

    // === Round 4: 正赛第三轮 (10 强赛，10 进 5) ===
    const r4Winners: string[] = [];
    const r4Matches: TournamentMatch[] = [];
    for (let i = 0; i < 5; i++) {
        const left = r3Winners[i * 2];
        const right = r3Winners[i * 2 + 1];
        const winner = i < 3 ? left : right;
        r4Winners.push(winner);
        r4Matches.push(createMatch(eventId, 4, i + 1, left, right, winner, at(3)));
    }
    const round4: TournamentRound = {
        id: `${eventId}-round-4`,
        number: 4,
        entrantCount: 10,
        phase: 'main',
        scheduledAt: at(3),
        completedAt: at(3),
        status: 'done',
        matches: r4Matches,
    };

    // === Round 5: 5 强冲刺轮 (5 进 3，1人轮空，4人打2场) ===
    // 胜者：小橘 (轮空直接晋级), 星河 (胜), 林芽 (胜)
    const r5Bye = r4Winners[0]; // 小橘
    const r5M1Left = r4Winners[1], r5M1Right = r4Winners[3]; // 星河 vs 选手D -> 星河胜
    const r5M2Left = r4Winners[2], r5M2Right = r4Winners[4]; // 林芽 vs 选手E -> 林芽胜
    const r5Matches: TournamentMatch[] = [
        createMatch(eventId, 5, 1, r5Bye, null, r5Bye, at(4), 'main', 'bye'),
        createMatch(eventId, 5, 2, r5M1Left, r5M1Right, r5M1Left, at(4)),
        createMatch(eventId, 5, 3, r5M2Left, r5M2Right, r5M2Left, at(4)),
    ];
    const round5: TournamentRound = {
        id: `${eventId}-round-5`,
        number: 5,
        entrantCount: 5,
        phase: 'main',
        scheduledAt: at(4),
        completedAt: at(4),
        status: 'done',
        matches: r5Matches,
    };

    // === Round 6: 半决赛 (3 进 2，1人轮空，2人打1场) ===
    // 星河轮空进决赛，小橘胜出；唯一败者林芽直接获得季军。
    const r6Matches: TournamentMatch[] = [
        createMatch(eventId, 6, 1, r5M1Left, null, r5M1Left, at(5), 'main', 'bye'),
        createMatch(eventId, 6, 2, r5Bye, r5M2Left, r5Bye, at(5)),
    ];
    const bronzeCandidates = [r5M2Left];
    const round6: TournamentRound = {
        id: `${eventId}-round-6`,
        number: 6,
        entrantCount: 3,
        phase: 'main',
        scheduledAt: at(5),
        completedAt: at(5),
        status: 'done',
        matches: r6Matches,
    };

    // === Round 7: 巅峰总决赛 (final) ===
    // 决赛：小橘 vs 星河 -> 小橘胜（冠军：小橘，亚军：星河）
    const r7Matches: TournamentMatch[] = [
        createMatch(eventId, 7, 1, r5Bye, r5M1Left, r5Bye, at(6), 'main'),
    ];
    const round7: TournamentRound = {
        id: `${eventId}-round-7`,
        number: 7,
        entrantCount: 2,
        phase: 'final',
        scheduledAt: at(6),
        completedAt: at(6),
        status: 'done',
        matches: r7Matches,
    };

    const podium = {
        '1': r5Bye,     // 小橘
        '2': r5M1Left,  // 星河
        '3': r5M2Left,  // 林芽
    };

    return {
        rounds: [round1, round2, round3, round4, round5, round6, round7],
        podium,
        bronzeCandidates,
    };
}

const currentId = 'local-tournament-current';
const bracketData = generate80Bracket();

const currentRewards: TournamentReward[] = [
    {
        id: `${currentId}-gold`,
        place: 1,
        actorId: bracketData.podium['1'],
        status: 'granted',
        grantedAt: at(6),
        result: {
            slot: 'weapon',
            source: 'decision_model',
            item: {
                name: '星辉的秘法杖',
                level: 28,
                quality: 'gold',
                slot: 'weapon',
                value: '68.50',
                stats: {magicAttack: 96, intelligence: 14},
                affixes: [
                    {id: 'intelligence', stat: 'intelligence', value: 10},
                    {id: 'critical', stat: 'critical', value: 5},
                ],
            },
        },
    },
    {
        id: `${currentId}-blue`,
        place: 2,
        actorId: bracketData.podium['2'],
        status: 'granted',
        grantedAt: at(6),
        result: {
            slot: 'weapon',
            source: 'code_fallback',
            item: {
                name: '逐风者的轻弓',
                level: 25,
                quality: 'blue',
                slot: 'weapon',
                value: '42.20',
                stats: {physicalAttack: 78, dexterity: 8},
                affixes: [{id: 'dexterity', stat: 'dexterity', value: 6}],
            },
        },
    },
    {
        id: `${currentId}-potions`,
        place: 3,
        actorId: bracketData.podium['3'],
        status: 'granted',
        grantedAt: at(6),
        result: {
            source: 'code_random',
            potions: [
                {recipeId: 'healing', name: '愈合药剂', price: '12.00', stars: 1, quantity: 1},
                {recipeId: 'iron', name: '铁壁药剂', price: '30.00', stars: 1, quantity: 1},
                {recipeId: 'fury', name: '狂暴药剂', price: '25.00', stars: 1, quantity: 1},
            ],
        },
    },
];

export const currentTournament: TournamentDetail = {
    id: currentId,
    week: week(0),
    status: 'completed',
    participantCount: mockTournamentActors.length, // 80 人
    roster: mockTournamentActors.map(a => ({id: a.id, name: a.name, avatar: a.avatar || ''})),
    result: {
        podium: bracketData.podium,
        bronzeCandidates: bracketData.bronzeCandidates,
    },
    createdAt: at(0),
    endedAt: at(6),
    nextRoundAt: null,
    rewards: currentRewards,
    rounds: bracketData.rounds,
};

const previousId = 'local-tournament-previous';
const previousTournament: TournamentDetail = {
    id: previousId,
    week: week(-7),
    status: 'completed',
    participantCount: 4,
    roster: residents.map(({id, name, avatar}) => ({id, name, avatar: avatar || ''})),
    result: {podium: {'1': residents[2].id, '2': residents[0].id, '3': residents[1].id}, bronzeCandidates: [residents[1].id, residents[3].id]},
    createdAt: at(-7),
    endedAt: at(-5),
    nextRoundAt: null,
    rewards: [
        {
            id: `${previousId}-gold`,
            place: 1,
            actorId: residents[2].id,
            status: 'granted',
            grantedAt: at(-5),
            result: {slot: 'weapon', source: 'decision_model', item: {name: '辉光巨剑', level: 23, quality: 'gold', slot: 'weapon', value: '54.18', stats: {physicalAttack: 82}, affixes: [{id: 'strength', stat: 'strength', value: 8}]}},
        },
        {
            id: `${previousId}-blue`,
            place: 2,
            actorId: residents[0].id,
            status: 'granted',
            grantedAt: at(-5),
            result: {slot: 'weapon', source: 'code_fallback', item: {name: '迅捷皮靴', level: 21, quality: 'blue', slot: 'feet', value: '34.44', stats: {speed: 15}, affixes: [{id: 'dexterity', stat: 'dexterity', value: 5}]}},
        },
        {
            id: `${previousId}-potions`,
            place: 3,
            actorId: residents[1].id,
            status: 'granted',
            grantedAt: at(-5),
            result: {source: 'code_random', potions: [
                {recipeId: 'healing', name: '愈合药剂', price: '12.00', stars: 1, quantity: 1},
                {recipeId: 'iron', name: '铁壁药剂', price: '30.00', stars: 1, quantity: 1},
                {recipeId: 'focus', name: '灵思药剂', price: '18.00', stars: 1, quantity: 1},
            ]},
        },
    ],
    rounds: [
        {
            id: `${previousId}-round-1`,
            number: 1,
            entrantCount: 4,
            phase: 'main',
            scheduledAt: at(-6),
            completedAt: at(-6),
            status: 'done',
            matches: [
                createMatch(previousId, 1, 1, residents[0].id, residents[1].id, residents[0].id, at(-6)),
                createMatch(previousId, 1, 2, residents[2].id, residents[3].id, residents[2].id, at(-6)),
            ],
        },
        {
            id: `${previousId}-round-2`,
            number: 2,
            entrantCount: 2,
            phase: 'final',
            scheduledAt: at(-5),
            completedAt: at(-5),
            status: 'done',
            matches: [
                createMatch(previousId, 2, 1, residents[0].id, residents[2].id, residents[2].id, at(-5)),
                createMatch(previousId, 2, 2, residents[1].id, residents[3].id, residents[1].id, at(-5), 'bronze'),
            ],
        },
    ],
};

const skippedTournament: TournamentDetail = {
    id: 'local-tournament-skipped',
    week: week(-14),
    status: 'skipped',
    participantCount: 1,
    roster: residents.slice(0, 1).map(({id, name, avatar}) => ({id, name, avatar: avatar || ''})),
    result: {},
    createdAt: at(-14),
    endedAt: at(-14),
    nextRoundAt: null,
    rounds: [],
    rewards: [],
};

export const tournamentHistory = [previousTournament, skippedTournament];
export const tournamentEvents = [currentTournament, ...tournamentHistory];
export const tournamentOverview: TournamentOverview = {
    event: currentTournament,
    autoEnabled: true,
    nextDrawAt: at(7),
};
