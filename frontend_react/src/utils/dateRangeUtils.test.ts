import assert from 'node:assert/strict';
import { test } from 'node:test';
import dayjs from 'dayjs';
import {
    calculateTotalDays,
    dateRangeToTimestamps,
    formatDisplayRange,
    normalizeDateRange,
    PRESETS,
} from './dateRangeUtils.ts';

test('formatDisplayRange formats same-year ranges as MM.DD — MM.DD matching design spec', () => {
    const range = { startDate: '2026-09-24', endDate: '2026-09-30' };
    const formatted = formatDisplayRange(range, 2026);
    assert.equal(formatted, '09.24 — 09.30');
});

test('formatDisplayRange formats single day in same year as MM.DD', () => {
    const singleDay = { startDate: '2026-09-24', endDate: '2026-09-24' };
    const formatted = formatDisplayRange(singleDay, 2026);
    assert.equal(formatted, '09.24');
});

test('formatDisplayRange includes full year when cross-year or different from current year', () => {
    const crossYear = { startDate: '2025-12-25', endDate: '2026-01-05' };
    const formatted = formatDisplayRange(crossYear, 2026);
    assert.equal(formatted, '2025.12.25 — 2026.01.05');

    const pastYearSingleDay = { startDate: '2024-05-01', endDate: '2024-05-01' };
    assert.equal(formatDisplayRange(pastYearSingleDay, 2026), '2024.05.01');
});

test('formatDisplayRange returns null for invalid or incomplete ranges', () => {
    assert.equal(formatDisplayRange(null), null);
    assert.equal(formatDisplayRange({ startDate: '', endDate: '2026-09-30' }), null);
    assert.equal(formatDisplayRange({ startDate: 'invalid', endDate: 'invalid' }), null);
});

test('calculateTotalDays correctly counts inclusive days regardless of input order', () => {
    assert.equal(calculateTotalDays('2026-09-24', '2026-09-30'), 7);
    assert.equal(calculateTotalDays('2026-09-30', '2026-09-24'), 7);
    assert.equal(calculateTotalDays('2026-09-24', '2026-09-24'), 1);
    assert.equal(calculateTotalDays('2026-02-01', '2026-02-28'), 28);
    assert.equal(calculateTotalDays('', '2026-09-30'), 0);
});

test('normalizeDateRange guarantees start <= end', () => {
    const ordered = normalizeDateRange('2026-09-24', '2026-09-30');
    assert.deepEqual(ordered, { startDate: '2026-09-24', endDate: '2026-09-30' });

    const reversed = normalizeDateRange('2026-09-30', '2026-09-24');
    assert.deepEqual(reversed, { startDate: '2026-09-24', endDate: '2026-09-30' });
});

test('PRESETS generate accurate day spans and boundaries for last 7, 30, and 90 days', () => {
    const ref = dayjs('2026-09-30');
    assert.equal(PRESETS.length, 3);

    const last7 = PRESETS.find(p => p.key === 'last7')!.getRange(ref);
    assert.equal(last7.startDate, '2026-09-24');
    assert.equal(last7.endDate, '2026-09-30');
    assert.equal(calculateTotalDays(last7.startDate, last7.endDate), 7);

    const last30 = PRESETS.find(p => p.key === 'last30')!.getRange(ref);
    assert.equal(last30.startDate, '2026-09-01');
    assert.equal(last30.endDate, '2026-09-30');
    assert.equal(calculateTotalDays(last30.startDate, last30.endDate), 30);

    const last90 = PRESETS.find(p => p.key === 'last90')!.getRange(ref);
    assert.equal(calculateTotalDays(last90.startDate, last90.endDate), 90);
});

test('dateRangeToTimestamps converts date strings to exact full-day start and end timestamps', () => {
    const range = { startDate: '2026-09-24', endDate: '2026-09-30' };
    const { since, until } = dateRangeToTimestamps(range);

    assert.ok(since !== undefined && until !== undefined);
    assert.equal(since, dayjs('2026-09-24 00:00:00').unix());
    assert.equal(until, dayjs('2026-09-30 23:59:59').unix());
    assert.ok(since < until);

    // Empty range returns undefined
    const empty = dateRangeToTimestamps(null);
    assert.equal(empty.since, undefined);
    assert.equal(empty.until, undefined);
});
