import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { collectedCodeSources } from './quantSourceCode.ts';
import type { QuantSource } from '../types/api/quant.ts';

function source(id: string, materialId: string, extras: Partial<QuantSource> = {}): QuantSource {
    return { id, materialId, codeVersionId: null, createdAt: '2026-10-29T00:00:00Z', payload: {code: id, language: 'pine'}, ...extras };
}

test('collected source codes follow the material current snapshot without duplicating versions', () => {
    const rows = [source('old', 'a', {materialCurrentSourceId: 'current'}),
        source('current', 'a', {materialCurrentSourceId: 'current'}),
        source('other', 'b'), source('version', 'c', {codeVersionId: 'version-id'}),
        source('feedback', 'd', {payload: {code: 'text', provenance: 'external_feedback'}}),
        source('no-code', 'e', {payload: {description: '说明'}})];
    assert.deepEqual(collectedCodeSources(rows).map((row) => row.id), ['current', 'other']);
    assert.deepEqual(collectedCodeSources([]), []);
});
