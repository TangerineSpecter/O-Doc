import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/hooks/useReadStats.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}});
const settled = () => new Promise(resolve => setImmediate(resolve));

function reader() {
    let now = 0, tick, visibility, cleanup;
    const calls = [];
    const doc = {
        hidden: false,
        addEventListener(_, callback) { visibility = callback; },
        removeEventListener() { visibility = undefined; },
    };
    const exports = {};
    runInNewContext(outputText, {exports, document: doc, performance: {now: () => now},
        window: {setInterval(fn) { tick = fn; return 1; }, clearInterval() { tick = undefined; }},
        console: {warn() {}}, require(module) {
            if (module === 'react') return {useEffect(effect) { cleanup = effect(); }};
            if (module === '../api/stats') return {reportReadDuration: (article, seconds) =>
                new Promise((resolve, reject) => calls.push({article, seconds, resolve, reject}))};
            throw new Error(module);
        }});
    return {
        calls, open(article) { exports.useReadStats(article); }, close() { cleanup(); },
        beat(at) { now = at; tick(); },
        visible(at, visible) { now = at; doc.hidden = !visible; visibility(); },
    };
}

test('切换文章时慢请求只结算原文章，后台停留不计时', async () => {
    const app = reader();
    app.open('a');
    app.beat(15000);
    app.beat(30000);
    app.close();
    app.open('b');
    app.visible(32000, false);
    app.visible(42000, true);
    app.calls[0].resolve();
    await settled();
    app.beat(45000);
    assert.deepEqual(app.calls.map(({article, seconds}) => [article, seconds]), [['a', 15], ['a', 15], ['b', 5]]);
    app.close();
    for (const call of app.calls) call.resolve();
    await settled();
    assert.equal(app.calls.length, 3);
});

test('失败批次留到下一次心跳，结束后的失败不无限重试', async () => {
    const app = reader();
    app.open('a');
    app.beat(15000);
    app.calls[0].reject(new Error('offline'));
    await settled();
    app.beat(30000);
    assert.equal(app.calls[1].seconds, 30);
    app.close();
    app.calls[1].reject(new Error('offline'));
    await settled();
    assert.equal(app.calls[2].seconds, 30);
    app.calls[2].reject(new Error('offline'));
    await settled();
    assert.equal(app.calls.length, 3);
});
