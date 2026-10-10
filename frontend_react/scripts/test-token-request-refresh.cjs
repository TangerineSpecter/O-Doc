const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual hook with deterministic React state/effect scheduling and fake HTTP.
function harness() {
    const states = [], effects = [], calls = [], pending = [];
    let stateIndex, effectIndex, hook;
    const react = {
        useState(initial) {
            const index = stateIndex++;
            if (!(index in states)) states[index] = initial;
            return [states[index], value => {
                states[index] = typeof value === 'function' ? value(states[index]) : value;
            }];
        },
        useEffect(fn, deps) {
            const index = effectIndex++;
            const old = effects[index];
            if (!old || deps.some((value, i) => value !== old.deps[i])) {
                old?.cleanup?.();
                effects[index] = {deps};
                pending.push(() => {effects[index].cleanup = fn();});
            }
        },
    };
    const api = {
        getTokenRequests(params, signal) {
            return new Promise((resolve, reject) => calls.push({params, signal, resolve, reject}));
        },
    };
    const module = {exports: {}};
    const source = ts.transpileModule(readFileSync(resolve(__dirname, '../src/hooks/useTokenUsage.ts'), 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
    }).outputText;
    vm.runInNewContext(source, {
        module, exports: module.exports, AbortController,
        require: name => name === 'react' ? react : api,
    });
    return {
        calls,
        render(filters = {all: '1'}) {
            stateIndex = effectIndex = 0;
            hook = module.exports.useTokenRequests(filters);
            pending.splice(0).forEach(fn => fn());
            return hook;
        },
        async respond(index, items, nextCursor) {
            calls[index].resolve({items, nextCursor, hasMore: Boolean(nextCursor)});
            await new Promise(resolve => setImmediate(resolve));
        },
        async fail(index) {
            calls[index].reject(new Error('offline'));
            await new Promise(resolve => setImmediate(resolve));
        },
    };
}

test('refresh after pagination starts at first page and replaces stale rows', async () => {
    const app = harness();
    app.render();
    await app.respond(0, [{id: 'first', status: 'running'}], 'page-2');
    app.render().more();
    app.render();
    assert.equal(app.calls[1].params.cursor, 'page-2');
    await app.respond(1, [{id: 'older', status: 'success'}]);
    assert.equal(app.render().result.items.length, 2);
    app.render().reload();
    app.render();
    assert.equal(app.calls[2].params.cursor, undefined);
    await app.respond(2, [{id: 'new', status: 'success'}, {id: 'first', status: 'success'}], 'page-2');
    const rows = app.render().result.items;
    assert.deepEqual(Array.from(rows, row => row.id), ['new', 'first']);
    assert.equal(rows[1].status, 'success');
});

test('failed page retry keeps the cursor and existing first page', async () => {
    const app = harness();
    app.render();
    await app.respond(0, [{id: 'first'}], 'page-2');
    app.render().more();
    app.render();
    await app.fail(1);
    assert.ok(app.render().error);
    app.render().retry();
    app.render();
    assert.equal(app.calls[2].params.cursor, 'page-2');
    await app.respond(2, [{id: 'older'}]);
    assert.deepEqual(Array.from(app.render().result.items, row => row.id), ['first', 'older']);
});
