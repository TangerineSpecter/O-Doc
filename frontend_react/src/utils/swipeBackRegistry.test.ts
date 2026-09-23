import assert from 'node:assert/strict';
import test from 'node:test';
import {
    registerSwipeBackInterceptor,
    triggerSwipeBackInterceptors,
} from './swipeBackRegistry.ts';

test('triggerSwipeBackInterceptors returns false when no interceptors registered', () => {
    assert.equal(triggerSwipeBackInterceptors(), false);
});

test('interceptor is executed in LIFO order and can consume the event', () => {
    const callOrder: string[] = [];

    const unregister1 = registerSwipeBackInterceptor(() => {
        callOrder.push('first');
        return false;
    });

    const unregister2 = registerSwipeBackInterceptor(() => {
        callOrder.push('second');
        return true; // consumes the event
    });

    const unregister3 = registerSwipeBackInterceptor(() => {
        callOrder.push('third');
        return false;
    });

    const result = triggerSwipeBackInterceptors();

    assert.equal(result, true);
    // third is executed first, returns false -> second is executed next, returns true -> stops!
    assert.deepEqual(callOrder, ['third', 'second']);

    // cleanup
    unregister1();
    unregister2();
    unregister3();

    assert.equal(triggerSwipeBackInterceptors(), false);
});

test('unregistering removes the interceptor cleanly', () => {
    let called = false;
    const unregister = registerSwipeBackInterceptor(() => {
        called = true;
        return true;
    });

    unregister();

    const result = triggerSwipeBackInterceptors();
    assert.equal(result, false);
    assert.equal(called, false);
});
