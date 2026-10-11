import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyticsRange, analyticsRangeError, analyticsMoney, sortAnalyticsResidents} from './residentAnalytics.ts';
import type {AnalyticsComparison} from '../types/api/residentAnalytics.ts';

test('Shanghai range includes both endpoints across UTC midnight', () => {
    assert.deepEqual(analyticsRange(7, new Date('2026-10-10T17:00:00Z')), {start_date: '2026-10-05', end_date: '2026-10-11'});
    assert.equal(analyticsRangeError('2026-01-01', '2027-01-01'), '');
    assert.match(analyticsRangeError('2026-01-01', '2027-01-02'), /366/);
    assert.ok(analyticsRangeError('2026-10-02', '2026-10-01'));
    assert.ok(analyticsRangeError('', '2026-10-01'));
});

test('currency display and sorting retain cents beyond Number precision', () => {
    assert.equal(analyticsMoney('-123456789.01'), '¥-123,456,789.01');
    const base = {name: '居民', avatar: '', departed: false, activeDays: 0, publications: 0, interactions: 0, received: 0, expense: '0.00', net: '0.00'};
    const rows: AnalyticsComparison[] = [{...base, id: 'a', income: '99999999999999.01'}, {...base, id: 'b', income: '99999999999999.02'}];
    assert.deepEqual(sortAnalyticsResidents(rows, 'income', true).map(row => row.id), ['b', 'a']);
    assert.deepEqual(sortAnalyticsResidents(rows, 'income', false).map(row => row.id), ['a', 'b']);
    assert.deepEqual(rows.map(row => row.id), ['a', 'b']);
});
