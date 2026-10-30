import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuantReport } from '../types/api/quant.ts';
import { researchReportScore } from './quantReportScore.ts';

const report = (schemaVersion: number, totalScore: unknown) => ({schemaVersion, data: {totalScore}} as QuantReport);

test('research cards use the same default report and retain unknown or zero scores', () => {
    assert.equal(researchReportScore([]), null);
    assert.equal(researchReportScore([report(5, 80), report(3, 60)]), 60);
    assert.equal(researchReportScore([report(3, null), report(3, 60)]), null);
    assert.equal(researchReportScore([report(4, 0)]), 0);
    assert.equal(researchReportScore([report(3, '99')]), null);
});
