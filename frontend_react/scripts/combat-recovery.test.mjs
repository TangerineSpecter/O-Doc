import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/hooks/useCombat.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;

// Run the real hook with controlled effects, timers and API responses.
async function mount({skew = 0} = {}) {
    const base = Date.parse('2026-10-22T10:00:00+08:00');
    let now = base, slot = 0, timerId = 0, dirty = false, fail = false, calls = 0;
    const slots = [], effects = [], pendingEffects = [], timers = new Map(), listeners = new Set();
    const document = {hidden: false, addEventListener: (_name, fn) => listeners.add(fn), removeEventListener: (_name, fn) => listeners.delete(fn)};
    const window = {
        setTimeout(fn, delay) {timers.set(++timerId, {fn, at: now + delay}); return timerId;},
        clearTimeout(id) {timers.delete(id);},
        setInterval(fn, delay) {timers.set(++timerId, {fn, at: now + delay, interval: delay}); return timerId;},
        clearInterval(id) {timers.delete(id);},
    };
    const react = {
        useState(initial) {
            const index = slot++;
            if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
            return [slots[index], value => {slots[index] = typeof value === 'function' ? value(slots[index]) : value; dirty = true;}];
        },
        useRef(value) {const index = slot++; return slots[index] ??= {current: value};},
        useCallback(fn) {slot++; return fn;},
        useEffect(fn, deps) {
            const index = slot++;
            if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i]))
                pendingEffects.push(() => {effects[index]?.cleanup?.(); effects[index] = {deps, cleanup: fn()};});
        },
    };
    const api = {
        async getCombatCatalog() {return {tables: {}};},
        async getCombatHistory() {return {list: []};},
        async getCombatProfile() {
            calls++;
            if (fail) throw new Error('offline');
            const full = now - base >= 600000;
            const nextAt = full ? null : new Date(base + (Math.floor((now - base) / 300000) + 1) * 300000).toISOString();
            return {hp: full ? 100 : 20, activeExplorationId: null, promotionBusy: false, restUntil: null,
                recovery: {serverNow: new Date(now).toISOString(), nextAt}};
        },
    };
    class ClientDate extends Date {static now() {return now + skew;}}
    const exports = {};
    runInNewContext(code, {exports, window, document, Date: ClientDate, AbortController,
        require(name) {if (name === 'react') return react; if (name === '../api/combat') return api; throw new Error(name);},
    });
    async function flush() {
        for (let i = 0; i < 16; i++) {
            await Promise.resolve();
            if (dirty) {dirty = false; slot = 0; exports.useCombat('resident');}
            while (pendingEffects.length) pendingEffects.shift()();
        }
    }
    dirty = true;
    await flush();
    return {
        get calls() {return calls;}, get timers() {return timers.size;},
        fail(value) {fail = value;},
        async hidden(value) {document.hidden = value; for (const fn of listeners) fn(); await flush();},
        async advance(milliseconds) {
            const target = now + milliseconds;
            for (;;) {
                const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                const [id, timer] = next;
                now = timer.at; timers.delete(id);
                if (timer.interval) timers.set(id, {...timer, at: now + timer.interval});
                timer.fn(); await flush();
            }
            now = target; await flush();
        },
        unmount() {effects.forEach(effect => effect?.cleanup?.());},
    };
}

test('refreshes only at recovery boundaries, stops when full, tolerates clock skew', async () => {
    const app = await mount({skew: 3600000});
    assert.equal(app.calls, 1);
    await app.advance(300000); assert.equal(app.calls, 1);
    await app.advance(250); assert.equal(app.calls, 2);
    await app.advance(300000); assert.equal(app.calls, 3);
    assert.equal(app.timers, 0);
    await app.advance(3600000); assert.equal(app.calls, 3);
    app.unmount();
});

test('hidden pages catch up on return and unmount cancels timers', async () => {
    const app = await mount();
    await app.hidden(true);
    await app.advance(300250); assert.equal(app.calls, 1);
    await app.hidden(false); assert.equal(app.calls, 2);
    app.unmount(); assert.equal(app.timers, 0);
    await app.advance(3600000); assert.equal(app.calls, 2);
});

test('failed requests back off before retrying', async () => {
    const app = await mount();
    app.fail(true);
    await app.advance(300250); assert.equal(app.calls, 2);
    await app.advance(29999); assert.equal(app.calls, 2);
    await app.advance(1); assert.equal(app.calls, 3);
    app.fail(false);
    await app.advance(60000); assert.equal(app.calls, 4);
    app.unmount();
});
