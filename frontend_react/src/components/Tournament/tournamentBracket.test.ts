import assert from 'node:assert/strict';
import test from 'node:test';
import {
    currentTournament,
    mockTournamentActors,
    tournamentReports,
} from '../../mocks/agentWorld/tournament';

test('tournament 80-participant bracket data structure and rules', () => {
    // 1. 确认共有 80 位特色居民参赛
    assert.equal(mockTournamentActors.length, 80);
    assert.equal(currentTournament.participantCount, 80);
    assert.equal(currentTournament.roster.length, 80);

    // 2. 确认第一轮为超出 64 人的资格预选附加赛（preliminary）
    const prelim = currentTournament.rounds[0];
    assert.equal(prelim.phase, 'preliminary');
    assert.equal(prelim.entrantCount, 80);
    assert.equal(prelim.matches.length, 40); // 80 进 40
    assert.equal(prelim.status, 'done');

    // 3. 确认正赛轮次（phase !== 'preliminary'）
    const mainRounds = currentTournament.rounds.filter(r => r.phase !== 'preliminary');
    assert.equal(mainRounds.length, 6);

    // 正赛首轮：40 强赛（40 进 20）
    assert.equal(mainRounds[0].entrantCount, 40);
    assert.equal(mainRounds[0].matches.length, 20);

    // 正赛次轮：20 强赛（20 进 10）
    assert.equal(mainRounds[1].entrantCount, 20);
    assert.equal(mainRounds[1].matches.length, 10);

    // 正赛第三轮：10 强赛（10 进 5）
    assert.equal(mainRounds[2].entrantCount, 10);
    assert.equal(mainRounds[2].matches.length, 5);

    // 5 强冲刺轮（5 进 3，含 1 人轮空）
    assert.equal(mainRounds[3].entrantCount, 5);
    assert.equal(mainRounds[3].matches.length, 3);
    assert.ok(mainRounds[3].matches.some(m => !m.rightId && m.result?.reason === 'bye'));

    // 半决赛（3 进 2，含 1 人轮空）
    assert.equal(mainRounds[4].entrantCount, 3);
    assert.equal(mainRounds[4].matches.length, 2);

    // 三人半决赛只有一名败者，决赛轮不再安排季军赛。
    const finalRound = mainRounds[5];
    assert.equal(finalRound.phase, 'final');
    assert.equal(finalRound.matches.length, 1);
    assert.ok(finalRound.matches.some(m => m.kind === 'main'));
    assert.ok(!finalRound.matches.some(m => m.kind === 'bronze'));
    const semiFinalLoser = mainRounds[4].matches.find(m => m.rightId)?.result.loserId;
    assert.deepEqual(currentTournament.result.bronzeCandidates, [semiFinalLoser]);
    assert.equal(currentTournament.result.podium?.['3'], semiFinalLoser);

    // 4. 领奖台冠亚季军与奖励
    const podium = currentTournament.result.podium;
    assert.ok(podium);
    assert.ok(podium['1']);
    assert.ok(podium['2']);
    assert.ok(podium['3']);

    assert.equal(currentTournament.rewards.length, 3);
    const goldReward = currentTournament.rewards.find(r => r.place === 1);
    const blueReward = currentTournament.rewards.find(r => r.place === 2);
    const potionReward = currentTournament.rewards.find(r => r.place === 3);
    assert.equal(goldReward?.result.item?.quality, 'gold');
    assert.equal(blueReward?.result.item?.quality, 'blue');
    assert.equal(potionReward?.result.potions?.length, 3);

    // 5. 战报完整性验证（所有对决都有对应的战报，避免 501 或 404）
    for (const round of currentTournament.rounds) {
        for (const m of round.matches) {
            const detail = tournamentReports.get(m.id);
            assert.ok(detail, `Match report for ${m.id} must exist`);
            if (m.rightId) {
                assert.ok(detail.report.participants && detail.report.participants.length === 2);
                assert.ok(detail.report.rounds && detail.report.rounds.length > 0);
            }
        }
    }
});
