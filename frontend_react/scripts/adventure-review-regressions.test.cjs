const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {renderToStaticMarkup} = require('react-dom/server');

function load(file, imports) {
    const module = {exports: {}};
    const source = ts.transpileModule(readFileSync(resolve(__dirname, '../src', file), 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
    }).outputText;
    vm.runInNewContext(source, {
        module, exports: module.exports, AbortController, Error,
        require: name => {
            if (name in imports) return imports[name];
            if (name === 'react/jsx-runtime' || name === 'lucide-react') return require(name);
            throw new Error(`Unexpected import: ${name}`);
        },
    });
    return module.exports;
}

const flush = () => new Promise(resolve => setImmediate(resolve));

// Run the real hook with controlled completion order and no network or browser.
function mountCatalog() {
    const states = [], effects = [], pending = [], calls = [];
    let stateIndex, effectIndex;
    const react = {
        useState(initial) {
            const index = stateIndex++;
            if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
            return [states[index], value => {
                states[index] = typeof value === 'function' ? value(states[index]) : value;
            }];
        },
        useCallback: fn => fn,
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
    const request = (kind, signal) => new Promise((resolve, reject) => calls.push({kind, signal, resolve, reject}));
    const {useAdventureCatalog} = load('hooks/useAdventureCatalog.ts', {
        react,
        '../api/combat': {
            getCombatCatalog: signal => request('catalog', signal),
            getCombatProfile: (actorId, signal) => request(actorId, signal),
        },
    });
    return {
        calls,
        render(actorId = 'actor-1') {
            stateIndex = effectIndex = 0;
            const state = useAdventureCatalog(actorId, true);
            pending.splice(0).forEach(fn => fn());
            return state;
        },
    };
}

for (const order of ['catalog-first', 'profile-first']) {
    test(`catalog failure survives profile success (${order}) and retry recovers`, async () => {
        const app = mountCatalog();
        app.render();
        const failCatalog = async () => {app.calls[0].reject(new Error('catalog offline')); await flush();};
        const finishProfile = async () => {app.calls[1].resolve({discoveries: {encountered: []}}); await flush();};
        if (order === 'catalog-first') {await failCatalog(); await finishProfile();}
        else {await finishProfile(); await failCatalog();}
        assert.equal(app.render().error, 'catalog offline');
        assert.equal(app.render().data, null);
        app.render().reload();
        app.render();
        app.calls[2].resolve({version: 'new', tables: {}});
        app.calls[3].resolve({discoveries: {encountered: []}});
        await flush();
        assert.equal(app.render().error, '');
        assert.equal(app.render().data.catalog.version, 'new');
    });
}

test('profile failure survives catalog success and a new resident can recover', async () => {
    const app = mountCatalog();
    app.render();
    app.calls[1].reject(new Error('profile offline'));
    await flush();
    app.calls[0].resolve({tables: {}});
    await flush();
    assert.equal(app.render().error, 'profile offline');
    app.render('actor-2');
    app.calls[2].resolve({discoveries: {encountered: ['slime']}});
    await flush();
    assert.equal(app.render('actor-2').error, '');
    assert.equal(app.render('actor-2').data.actorId, 'actor-2');
});

test('an aborted resident response cannot clear a catalog error', async () => {
    const app = mountCatalog();
    app.render();
    app.render('actor-2');
    assert.equal(app.calls[1].signal.aborted, true);
    app.calls[0].reject(new Error('catalog offline'));
    app.calls[1].resolve({discoveries: {}});
    app.calls[2].resolve({discoveries: {}});
    await flush();
    assert.equal(app.render('actor-2').error, 'catalog offline');
});

const {DecisionConnectionCard} = load('components/Settings/DecisionConnectionCard.tsx', {});
for (const [success, message, label] of [
    [false, '决策模型未返回有效模型名称', '失败'],
    [false, '服务状态不正常', '失败'],
    [true, '测试完成', '正常'],
]) {
    test(`connection status uses explicit ${success} for “${message}”`, () => {
        const html = renderToStaticMarkup(DecisionConnectionCard({
            connection: {id: 'test', name: 'Test', modelId: 'test', protocol: 'openai_chat_json'},
            result: {success, message}, onTest() {},
        }));
        assert.ok(html.includes(`title="${message}"`));
        assert.ok(html.includes(`<span>${label}</span>`));
        assert.ok(html.includes(success ? 'text-emerald-600' : 'text-rose-600'));
    });
}
