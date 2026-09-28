import assert from 'node:assert/strict';
import test from 'node:test';
import {agentTaskSaveError, travelConfigError} from './agentTaskValidation.ts';

const config = {collectionId: 'collection', categoryId: 'travel', searchServerId: 'search', nodeMinutes: 1, recentCities: 3, energyCost: 20, photoEnabled: true};

test('travel configuration reports the missing category before submission', () => {
    assert.equal(travelConfigError({...config, categoryId: ''}), '请选择旅行工作流分类');
    assert.equal(travelConfigError(config), undefined);
    assert.match(travelConfigError({...config, nodeMinutes: 1.5})!, /节点间隔/);
    assert.match(travelConfigError({...config, energyCost: 101})!, /体力/);
    assert.equal(travelConfigError({...config, recentCities: 0, energyCost: 0}), undefined);
});

test('nested backend validation exposes actionable messages instead of a generic save failure', () => {
    assert.equal(agentTaskSaveError({response: {data: {msg: '任务配置不符合要求', data: {travelConfig: {nonFieldErrors: ['菲伦 未绑定启用的旅行游记 Skill']}}}}}), '菲伦 未绑定启用的旅行游记 Skill');
    assert.equal(agentTaskSaveError(new Error('网络请求错误')), '网络请求错误');
    assert.equal(agentTaskSaveError(undefined), '保存任务失败，请稍后重试');
});
