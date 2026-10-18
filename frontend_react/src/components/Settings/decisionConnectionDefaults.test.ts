import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JEV_DEFAULT_BASE_URL, JEV_DEFAULT_MODEL_ID, fieldsAfterProtocolChange} from './decisionConnectionDefaults.ts';

test('JEV defaults match the historical connection profile', () => {
    assert.equal(JEV_DEFAULT_BASE_URL, 'https://api.typesafe.ai/v1');
    assert.equal(JEV_DEFAULT_MODEL_ID, 'jev-latest');
});

test('selecting JEV fills an empty service URL and model ID', () => {
    assert.deepEqual(
        fieldsAfterProtocolChange('openai_chat_json', 'systemone', {baseUrl: '', modelId: '   '}),
        {baseUrl: 'https://api.typesafe.ai/v1', modelId: 'jev-latest'},
    );
});

test('selecting JEV keeps a service URL or model ID the user already typed', () => {
    assert.deepEqual(
        fieldsAfterProtocolChange('openai_chat_json', 'systemone', {
            baseUrl: 'http://127.0.0.1:8080/v1',
            modelId: 'startlux-decision',
        }),
        {baseUrl: 'http://127.0.0.1:8080/v1', modelId: 'startlux-decision'},
    );
});

test('leaving JEV clears only fields that still hold the JEV default', () => {
    assert.deepEqual(
        fieldsAfterProtocolChange('systemone', 'openai_chat_json', {
            baseUrl: 'https://api.typesafe.ai/v1',
            modelId: 'jev-custom',
        }),
        {baseUrl: '', modelId: 'jev-custom'},
    );
});

test('switching back restores a cleared JEV default without touching an edited field', () => {
    const afterLeave = fieldsAfterProtocolChange('systemone', 'openai_chat_json', {
        baseUrl: 'https://api.typesafe.ai/v1',
        modelId: 'local-decision',
    });
    assert.deepEqual(
        fieldsAfterProtocolChange('openai_chat_json', 'systemone', afterLeave),
        {baseUrl: 'https://api.typesafe.ai/v1', modelId: 'local-decision'},
    );
});

test('selecting the same protocol again does not rewrite the fields', () => {
    const fields = {baseUrl: 'https://example.test/v1', modelId: 'kept'};
    assert.equal(fieldsAfterProtocolChange('systemone', 'systemone', fields), fields);
});
