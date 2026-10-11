import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Navigator} from 'react-router-dom';
import {guardNovelNavigation, initializeNovelNavigation} from './novelNavigation.ts';

function fixture(routerPop?: () => void) {
    const events = new EventTarget();
    const entries = ['/', '/novel/n'];
    let position = 1, dirty = true;
    let proceed: (() => void) | undefined;
    const history = {
        get state() {return {idx: position};},
        go(delta: number) {
            queueMicrotask(() => {
                const next = position + delta;
                if (next < 0 || next >= entries.length || next === position) return;
                position = next;events.dispatchEvent(new Event('popstate'));
            });
        },
    };
    const previous = globalThis.window;
    globalThis.window = Object.assign(events, {history}) as unknown as Window & typeof globalThis;
    initializeNovelNavigation();
    // Match the app: router history listens before the lazy workbench mounts.
    if (routerPop) events.addEventListener('popstate', routerPop);
    const navigator = {
        push(to: string) {entries.splice(++position);entries[position] = to;},
        replace(to: string) {entries[position] = to;},
    } as unknown as Navigator;
    const originalPush = navigator.push;
    const cleanup = guardNovelNavigation(navigator, () => dirty, next => {proceed = next;});
    return {
        navigator, events, history, originalPush,
        path: () => entries[position],
        proceed: () => {assert.ok(proceed);proceed();},
        clean: () => {dirty = false;},
        close: () => {cleanup();assert.equal(navigator.push, originalPush);globalThis.window = previous;},
    };
}

test('dirty push/replace waits for confirmation; clean navigation and cleanup work', () => {
    const f = fixture();
    try {
        f.navigator.push('/novel/n/read');assert.equal(f.path(), '/novel/n');
        f.proceed();assert.equal(f.path(), '/novel/n/read');
        f.navigator.replace('/');assert.equal(f.path(), '/novel/n/read');
        f.proceed();assert.equal(f.path(), '/');
        f.clean();f.navigator.push('/next');assert.equal(f.path(), '/next');
    } finally {f.close();}
});

test('cancelled browser back restores history before the router can unmount; confirmation replays once', async () => {
    let routerEvents = 0;
    const f = fixture(() => {routerEvents++;});
    try {
        f.history.go(-1);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.path(), '/novel/n');assert.equal(routerEvents, 0);
        f.proceed();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.path(), '/');assert.equal(routerEvents, 1);
        // The one accepted transition does not exempt later dirty navigation.
        f.history.go(1);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.path(), '/');assert.equal(routerEvents, 1);
    } finally {f.close();}
});

test('refresh/close prompts only while manuscript is dirty', () => {
    const f = fixture();
    try {
        const dirty = new Event('beforeunload', {cancelable: true});
        Object.defineProperty(dirty, 'returnValue', {value: '', writable: true});
        f.events.dispatchEvent(dirty);
        assert.equal(dirty.defaultPrevented, true);
        f.clean();
        const clean = new Event('beforeunload', {cancelable: true});f.events.dispatchEvent(clean);
        assert.equal(clean.defaultPrevented, false);
    } finally {f.close();}
});
