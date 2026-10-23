import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SocialTheatreEvent} from '../types/api/social';
import {selectTheatreEvent, theatrePollInterval} from './socialTheatre';

function event(id: string, status: SocialTheatreEvent['status'], hour: number): SocialTheatreEvent {
    return {id, status, businessDate: '2026-10-23', scheduledAt: `2026-10-23T${hour}:00:00+08:00`,
        error: '', source: {title: id, summary: '', url: '', publishedAt: ''}, participants: []};
}

test('未来排期不能盖过正在讨论或检索的场次', () => {
    const future = event('future', 'scheduled', 20);
    const searching = event('searching', 'searching', 12);
    const running = event('running', 'running', 10);
    const rows = [future, searching, running];
    assert.equal(selectTheatreEvent(rows), running);
    assert.equal(selectTheatreEvent([future, searching]), searching);
    assert.deepEqual(rows.map(row => row.id), ['future', 'searching', 'running']);
});

test('无活跃讨论时选择最近待开始排期，再回退到最新历史或空状态', () => {
    const later = event('later', 'scheduled', 20);
    const next = event('next', 'scheduled', 16);
    const completed = event('completed', 'completed', 14);
    const older = event('older', 'failed', 10);
    assert.equal(selectTheatreEvent([later, next, completed]), next);
    assert.equal(selectTheatreEvent([completed, older]), completed);
    assert.equal(selectTheatreEvent([]), null);
});

test('讨论和检索短轮询，排期、终态及空列表继续低频发现新场次', () => {
    for (const status of ['running', 'searching'] as const) assert.equal(theatrePollInterval(status), 6000);
    for (const status of ['scheduled', 'completed', 'failed', 'skipped', 'expired', undefined] as const) {
        assert.equal(theatrePollInterval(status), 30000);
    }
});
