import assert from 'node:assert/strict';
import test from 'node:test';
import {currentTournament} from '../../mocks/agentWorld/tournament';
import {resolveTournamentArtRoute} from '../../mocks/agentWorld/tournamentArt';

test('tournament art mock api routes workflow', async () => {
    const tournamentId = currentTournament.id;

    // 1. GET tournament illustration data
    const getReq = new Request(`http://localhost/api/settings/agent-world/tournaments/${encodeURIComponent(tournamentId)}/illustration/`, {
        method: 'GET',
    });
    const getData = await resolveTournamentArtRoute(getReq) as {
        assetId: string;
        canGenerate: boolean;
        moments: Array<{id: string; damage: number}>;
        options: {configured: boolean; models: Array<{value: string; label: string}>};
    };

    assert.ok(getData, 'GET 请求应成功返回配图数据');
    assert.equal(getData.options.configured, true, '生图配置应已就绪');
    assert.ok(getData.moments.length > 0, '决赛战报应成功提取高光战斗瞬间');
    assert.equal(getData.canGenerate, true, '有高光瞬间时 canGenerate 应为 true');

    // 2. POST generate art
    const postReq = new Request(`http://localhost/api/settings/agent-world/tournaments/${encodeURIComponent(tournamentId)}/illustration/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            modelId: 'local-art-model',
            momentId: getData.moments[0].id,
            prompt: '史诗决战，雷霆万钧',
        }),
    });
    const taskResult = await resolveTournamentArtRoute(postReq) as {
        taskId: string;
        assetId: string;
        status: string;
    };
    assert.ok(taskResult?.taskId, '生图任务应产生 taskId');
    assert.ok(taskResult?.assetId, '生图任务应产生 assetId');
    assert.equal(taskResult.status, 'succeeded', '本地样例生图状态应为 succeeded');

    // 3. PUT apply art
    const putReq = new Request(`http://localhost/api/settings/agent-world/tournaments/${encodeURIComponent(tournamentId)}/illustration/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            taskId: taskResult.taskId,
        }),
    });
    const applyResult = await resolveTournamentArtRoute(putReq) as {assetId: string};
    assert.equal(applyResult?.assetId, taskResult.assetId, '应用配图后返回的 assetId 应与生图一致');

    // 4. Download generated image
    const downloadReq = new Request(`http://localhost/api/resource/download/${taskResult.assetId}`, {
        method: 'GET',
    });
    const downloadResp = await resolveTournamentArtRoute(downloadReq) as Response;
    assert.ok(downloadResp, '生成的纪念图应可下载');
    assert.equal(downloadResp.status, 200, '下载状态应为 200');

    // 5. DELETE release task
    const delReq = new Request(`http://localhost/api/settings/agent-world/tournaments/${encodeURIComponent(tournamentId)}/illustration/`, {
        method: 'DELETE',
    });
    const delResult = await resolveTournamentArtRoute(delReq) as object;
    assert.ok(delResult, '释放任务应返回空对象');
});
