import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeImportedSource } from './quantSourceImport.ts';

const bytes = (value: string) => new TextEncoder().encode(value).buffer;

test('detects supported languages from the file extension without changing its contents', () => {
    const code = '  value = 1\r\n# note\r\n';
    for (const [name, language] of [['script.PY', 'python'], ['script.pyw', 'python'], ['indicator.pinescript', 'pine'], ['indicator.pine', 'pine'],
        ['expert.mq4', 'mql4'], ['include.mqh', 'mql4'], ['formula.tdx', 'tongdaxin']] as const) {
        assert.deepEqual(decodeImportedSource(bytes(code), name), { code, language });
    }
    assert.equal(decodeImportedSource(bytes('//@version=6\nindicator("x")'), 'source.txt').language, 'pine');
    assert.equal(decodeImportedSource(bytes('import something'), 'source.js').language, 'text');
});

test('accepts UTF-16 and rejects binary, empty or oversized source', () => {
    assert.deepEqual(decodeImportedSource(new Uint8Array([0xff, 0xfe, 0x61, 0, 0x0a, 0]).buffer, 'a.py'), { code: 'a\n', language: 'python' });
    assert.throws(() => decodeImportedSource(bytes('  '), 'a.py'), /为空/);
    assert.throws(() => decodeImportedSource(new Uint8Array([0, 1, 2, 3]).buffer, 'a.py'), /文本源码/);
    assert.throws(() => decodeImportedSource(bytes('x'.repeat(150_001)), 'a.py'), /150,000/);
    assert.throws(() => decodeImportedSource(new ArrayBuffer(600_001), 'a.py'), /600 KB/);
});


test('source import accepts the exact character boundary, including Unicode code points', () => {
    const code = '😀'.repeat(150_000);
    assert.equal(decodeImportedSource(bytes(code), 'source.txt').code, code);
    assert.throws(() => decodeImportedSource(bytes('x'.repeat(150_001)), 'source.txt'), /150,000/);
});
