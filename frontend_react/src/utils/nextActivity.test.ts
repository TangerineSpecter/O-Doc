import assert from 'node:assert/strict';
import test from 'node:test';
import {nextActivityLabel} from './nextActivity';

test('next activity uses Shanghai day boundaries and a compact time', () => {
    const now = new Date('2026-10-22T23:30:00+08:00');
    assert.equal(nextActivityLabel('2026-10-22T15:45:00Z', now)?.text, '下次 23:45');
    assert.equal(nextActivityLabel('2026-10-22T16:15:00Z', now)?.text, '下次 明天 00:15');
    assert.equal(nextActivityLabel('2026-10-24T09:00:00+08:00', now)?.text, '下次 10/24 09:00');
    assert.equal(nextActivityLabel('2026-10-22T22:00:00+08:00', now)?.text, '待执行');
    assert.equal(nextActivityLabel(null, now), null);
    assert.equal(nextActivityLabel('invalid', now), null);
});
