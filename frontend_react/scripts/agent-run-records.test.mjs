import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual hook with deterministic hook slots and a paginated API.
// No browser, timers, or provider requests are needed for this state regression.
const source = readFileSync(new URL('../src/hooks/useAgentRunRecords.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const records = (count, prefix = 'old') => Array.from({length: count}, (_, index) => ({id: `${prefix}-${index}`, status: 'completed'}));

function mount(initial) {
    const slots = [], calls = [], detailCalls = [];
    let slot = 0, rows = initial, fail = false;
    const react = {
        useState(value) {
            const index = slot++;
            slots[index] ??= value;
            return [slots[index], next => {slots[index] = next;}];
        },
        useRef(value) {
            const index = slot++;
            return slots[index] ??= {current: value};
        },
        useCallback: fn => fn,
        useEffect() {},
    };
    const api = {
        async getAgentRunRecords({limit, cursor}) {
            calls.push(cursor);
            if (fail) throw new Error('offline');
            const start = cursor ? rows.findIndex(row => row.id === cursor) + 1 : 0;
            const items = rows.slice(start, start + limit);
            const hasMore = start + items.length < rows.length;
            return {items, hasMore, nextCursor: hasMore ? items.at(-1).id : null};
        },
        async getAgentRunRecord(id) {
            detailCalls.push(id);
            return rows.find(row => row.id === id);
        },
    };
    const exports = {};
    runInNewContext(code, {exports, AbortController, require: name => {
        if (name === 'react') return react;
        if (name === '../api/setting') return api;
        throw new Error(`Unexpected import: ${name}`);
    }});
    const render = () => {slot = 0; return exports.useAgentRunRecords();};
    return {render, calls, detailCalls, replace: next => {rows = next;}, offline: value => {fail = value;}};
}

async function loadAll(hook) {
    while (hook.render().hasMore) await hook.render().loadMore();
}

test('refresh after a full page of new runs reopens pagination without gaps', async () => {
    const old = records(5);
    const hook = mount(old);
    await loadAll(hook);
    assert.equal(hook.render().hasMore, false);
    const updated = [...records(25, 'new'), ...old];
    hook.replace(updated);
    await hook.render().refresh();
    assert.equal(hook.render().hasMore, true);
    assert.equal(hook.render().nextCursor, 'new-19');
    assert.equal(hook.render().records.length, 20);
    await loadAll(hook);
    assert.deepEqual(Array.from(hook.render().records, row => row.id), updated.map(row => row.id));
});

test('refresh resets an old unfinished cursor when the new page has no overlap', async () => {
    const old = records(60);
    const hook = mount(old);
    await hook.render().loadMore();
    await hook.render().loadMore();
    assert.equal(hook.render().nextCursor, 'old-39');
    const updated = [...records(20, 'new'), ...old];
    hook.replace(updated);
    await hook.render().refresh();
    await loadAll(hook);
    assert.deepEqual(Array.from(hook.render().records, row => row.id), updated.map(row => row.id));
    assert.equal(hook.calls[3], 'new-19');
});

test('overlapping refresh preserves history and updates older running rows', async () => {
    const old = records(60);
    old[30].status = 'running';
    const hook = mount(old);
    await hook.render().loadMore();
    await hook.render().loadMore();
    hook.replace([...records(3, 'new'), ...old.map(row => ({...row, status: 'completed'}))]);
    await hook.render().refresh();
    assert.equal(hook.render().records.length, 43);
    assert.equal(hook.render().nextCursor, 'old-39');
    assert.equal(hook.render().records.find(row => row.id === 'old-30').status, 'completed');
    assert.deepEqual(hook.detailCalls, ['old-30']);
    await loadAll(hook);
    assert.equal(hook.render().records.length, 63);
    assert.equal(new Set(hook.render().records.map(row => row.id)).size, 63);
});

test('failed refresh keeps history and retry uses the new first page cursor', async () => {
    const old = records(30);
    const hook = mount(old);
    await hook.render().loadMore();
    hook.replace([...records(25, 'new'), ...old]);
    hook.offline(true);
    await hook.render().refresh();
    assert.equal(hook.render().records.length, 20);
    assert.equal(hook.render().nextCursor, 'old-19');
    assert.equal(hook.render().error, '执行状态刷新失败');
    hook.offline(false);
    await hook.render().retry();
    assert.equal(hook.render().nextCursor, 'new-19');
    assert.equal(hook.render().error, '');
    await loadAll(hook);
    assert.equal(hook.render().records.length, 55);
});
