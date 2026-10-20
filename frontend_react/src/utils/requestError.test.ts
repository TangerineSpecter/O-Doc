import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isResourceNotFoundError} from './requestError';

test('HTTP 404 响应被识别为资源不存在', () => {
    const error = Object.assign(new Error('资源不存在'), {response: {status: 404, data: {code: 404, msg: '资源不存在'}}});
    assert.equal(isResourceNotFoundError(error), true);
});

test('HTTP 200 但业务码为 404 时按提示文案识别', () => {
    assert.equal(isResourceNotFoundError(new Error('资源不存在')), true);
});

test('响应体 code 为 404 时被识别', () => {
    const error = Object.assign(new Error('Error'), {response: {status: 200, data: {code: 404, msg: '资源不存在'}}});
    assert.equal(isResourceNotFoundError(error), true);
});

test('网络错误与服务器错误不会被误判为资源不存在', () => {
    assert.equal(isResourceNotFoundError(Object.assign(new Error('服务器内部错误'), {response: {status: 500}})), false);
    assert.equal(isResourceNotFoundError(new Error('Network Error')), false);
    assert.equal(isResourceNotFoundError(null), false);
    assert.equal(isResourceNotFoundError(undefined), false);
    assert.equal(isResourceNotFoundError(''), false);
});
