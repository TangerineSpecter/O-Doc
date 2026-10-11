import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequestKey} from './requestKey';

test('combat request and session keys work without randomUUID and retain their format', () => {
    const descriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', {value: undefined, configurable: true});
    try {
        const keys = Array.from({length: 1000}, () => createRequestKey());
        for (const key of keys) assert.match(key, /^[0-9a-f]{32}$/);
        assert.equal(new Set(keys).size, keys.length);
    } finally {
        if (descriptor) Object.defineProperty(crypto, 'randomUUID', descriptor);
        else Reflect.deleteProperty(crypto, 'randomUUID');
    }
});

test('request keys encode all cryptographic random bytes, including leading zeros', t => {
    t.mock.method(crypto, 'getRandomValues', (bytes: Uint8Array) => {
        assert.equal(bytes.length, 16);
        bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 255]);
        return bytes;
    });
    assert.equal(createRequestKey(), '000102030405060708090a0b0c0d0eff');
});
