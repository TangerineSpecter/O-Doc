import assert from 'node:assert/strict';
import {test} from 'node:test';
import {dayOf} from '../../utils/tokenObservatory.ts';
import {observationRequests, observationRoute} from './tokenUsage.ts';

interface MockReport {
    metadata: {activity_filter: string};
    summary: {request_count: number; request_missing_count: number; response_missing_count: number};
    requests: {id: string; content: {available: boolean; request_present: boolean; response_present: boolean; request?: unknown; response?: unknown}}[];
}

test('local 观测导出按选择的 ID 返回正文并区分正文缺失', () => {
    const actor = observationRequests[0].agentKey;
    const day = dayOf(observationRequests[0].startedAt);
    const url = new URL(`http://local/api/settings/agent-world/token-usage/observation-export/?agent_id=${actor}&start_date=${day}&end_date=${day}`);
    const selected = observationRequests.filter(row => row.agentKey === actor && row.taskName === '投资决策').slice(0, 2);
    const report = observationRoute(url, false, {request_ids: selected.map(row => row.id),
        activity_filter: 'activity:投资决策', activity_label: '投资决策'}) as MockReport;
    assert.equal(report.metadata.activity_filter, 'activity:投资决策');
    assert.equal(report.summary.request_count, 2);
    assert.deepEqual(new Set(report.requests.map(row => row.id)), new Set(selected.map(row => row.id)));
    assert.ok(report.requests.every(row => row.content.request_present && row.content.response_present));

    const missing = observationRequests.find(row => row.agentKey === actor && row.phase === '记忆整理')!;
    const missingReport = observationRoute(url, false, {request_ids: [missing.id],
        activity_filter: 'activity:记忆整理', activity_label: '记忆整理'}) as MockReport;
    assert.equal(missingReport.summary.request_missing_count, 1);
    assert.equal(missingReport.summary.response_missing_count, 1);
    assert.equal(missingReport.requests[0].content.available, false);

    const factReport = observationRoute(url, false, {request_ids: [],
        activity_filter: 'fact:fishing', activity_label: '未关联事实 · 钓鱼'}) as MockReport;
    assert.equal(factReport.summary.request_count, 0);
    assert.deepEqual(factReport.requests, []);
    const other = observationRequests.find(row => row.agentKey !== actor)!;
    const rejected = observationRoute(url, false, {request_ids: [other.id],
        activity_filter: 'activity:投资决策', activity_label: '投资决策'}) as Response;
    assert.equal(rejected.status, 409);
});
