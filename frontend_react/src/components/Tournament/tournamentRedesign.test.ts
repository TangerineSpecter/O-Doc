import assert from 'node:assert/strict';
import test from 'node:test';
import {
    currentTournament,
    tournamentHistory,
} from '../../mocks/agentWorld/tournament';

test('tournament rewards and history redesign verification', () => {
    // 1. 验证当前大会的奖励数据结构
    assert.equal(currentTournament.rewards.length, 3);
    const goldReward = currentTournament.rewards.find(r => r.place === 1);
    const blueReward = currentTournament.rewards.find(r => r.place === 2);
    const potionReward = currentTournament.rewards.find(r => r.place === 3);

    assert.ok(goldReward?.result.item, '冠军应包含金装物品');
    assert.equal(goldReward?.result.item?.quality, 'gold');
    assert.ok(blueReward?.result.item, '亚军应包含蓝装物品');
    assert.equal(blueReward?.result.item?.quality, 'blue');
    assert.ok(potionReward?.result.potions?.length, '季军应包含药剂奖励');

    // 2. 验证领奖台排名与奖励对应
    const champId = currentTournament.result.podium?.['1'];
    assert.ok(champId, '当前大会应产生冠军');
    const winnerActor = currentTournament.roster.find(r => r.id === champId);
    assert.ok(winnerActor, '冠军应在参赛名单中且具有姓名');
    assert.ok((winnerActor?.name.length ?? 0) > 0);

    // 3. 验证历史记录中的完赛与未开赛场景
    assert.equal(tournamentHistory.length, 2);
    const completedHistory = tournamentHistory.find(h => h.status === 'completed');
    const skippedHistory = tournamentHistory.find(h => h.status === 'skipped');

    assert.ok(completedHistory, '历届记录中包含完赛大会');
    assert.ok(completedHistory?.result.podium?.['1'], '完赛历史大会具备三甲榜单数据');

    assert.ok(skippedHistory, '历届记录中包含因人数不足取消的大会');
    assert.equal(skippedHistory?.participantCount, 1, '未开赛大会参赛人数不足 4 人');
    assert.equal(Object.keys(skippedHistory?.result.podium || {}).length, 0, '未开赛大会无领奖台名单');
});
