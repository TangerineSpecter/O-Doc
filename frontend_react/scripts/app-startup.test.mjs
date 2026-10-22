import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const noop = () => {};
function compile(path, transform = source => source) {
    return ts.transpileModule(transform(readFileSync(new URL(path, import.meta.url), 'utf8')), {compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    }}).outputText;
}
function loadModule(path) {
    const exports = {};
    runInNewContext(compile(path), {exports, require, URL});
    return exports;
}
const {clearMockWorkers} = loadModule('../src/utils/mockStartup.ts');
const StartupError = loadModule('../src/components/common/StartupError.tsx').default;

// Exercise the real entry point and failure screen, replacing only its environment and App.
const source = compile('../src/main.tsx', value => {
    assert.ok(value.includes('void startApplication();'));
    return value.replaceAll('import.meta.hot', 'undefined')
        .replace('void startApplication();', 'globalThis.startupDone = startApplication();');
});
function runStartup({localMode = false, mocksEnabled = localMode,
    registrations = async () => [], start = async () => {}, barFails = false, diagnosticFails = false} = {}) {
    const state = {appMounts: 0, barMounts: 0, starts: 0, diagnostics: [], savedTokens: [], html: ''};
    const context = {exports: {}, navigator: {serviceWorker: {getRegistrations: registrations}},
        document: {getElementById: () => ({}), title: ''}, window: {location: {reload: noop}},
        require(name) {
            if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
            if (name === 'react-dom/client') return {createRoot: () => ({render(element) {
                state.html = renderToStaticMarkup(element);
            }})};
            if (name === './App.tsx') return {default: () => {
                state.appMounts++; return React.createElement('main', null, '业务页面');
            }};
            if (name === './components/common/StartupError') return {default: StartupError};
            if (name === './components/common/DiagnosticBoundary') return {default: ({children}) => children};
            if (name === './config/development') return {localMode, mocksEnabled};
            if (name === './config/fonts.ts') return {applyAppFont: noop, getStoredAppFont: noop};
            if (name === './utils/preventZoom.ts') return {setupPreventZoom: noop};
            if (name === './utils/modalScrollLock.ts') return {installModalScrollLock: () => noop};
            if (name === './utils/diagnostics') return {installRuntimeDiagnostics: () => noop,
                reportDiagnostic(input) {state.diagnostics.push(input); if (diagnosticFails) throw new Error('诊断不可用');}};
            if (name === './utils/authStorage') return {getAuthToken: () => null,
                saveAuthToken: token => state.savedTokens.push(token)};
            if (name === './utils/mockStartup') return {clearMockWorkers};
            if (name === './mocks/browser.ts') return {worker: {async start() {state.starts++; await start();}}};
            if (name === './mocks/LocalModeBar') {
                if (barFails) throw new Error('调试条加载失败');
                return {default: () => {state.barMounts++; return React.createElement('aside', null, 'LOCAL');}};
            }
            if (name === './index.css') return {};
            throw new Error(`Unexpected startup import: ${name}`);
        }};
    runInNewContext(source, context);
    return {state, done: context.startupDone};
}

test('normal startup continues when worker lookup or unregister fails, even if diagnostics fail', async () => {
    for (const registrations of [async () => {throw new Error('worker 权限受限');}, async () => [{
        active: {scriptURL: 'http://localhost/mockServiceWorker.js'},
        unregister: async () => {throw new Error('注销受限');},
    }]]) {
        const {state, done} = runStartup({registrations, diagnosticFails: true});
        await done;
        assert.equal(state.appMounts, 1);
        assert.equal(state.starts, 0);
        assert.equal(state.diagnostics.length, 1);
        assert.doesNotMatch(state.html, /role="alert"/);
    }
});

test('cleanup removes only mock workers and supports browsers without service workers', async () => {
    const removed = [];
    await clearMockWorkers();
    await clearMockWorkers({getRegistrations: async () => [
        {active: {scriptURL: 'http://localhost/app-worker.js'}, unregister: async () => removed.push('app')},
        {waiting: {scriptURL: 'http://localhost/mockServiceWorker.js'}, unregister: async () => removed.push('mock')},
    ]});
    assert.deepEqual(removed, ['mock']);
});

test('local mock failure renders a retry screen without mounting App or sending diagnostics', async () => {
    const {state, done} = runStartup({localMode: true, start: async () => {throw new Error('内部错误不应显示');}});
    await done;
    assert.equal(state.appMounts, 0);
    assert.equal(state.barMounts, 0);
    assert.equal(state.diagnostics.length, 0);
    assert.deepEqual(state.savedTokens, []);
    assert.match(state.html, /role="alert"/);
    assert.match(state.html, /本地样例启动失败/);
    assert.match(state.html, /刷新重试/);
    assert.doesNotMatch(state.html, /内部错误不应显示/);
});

test('explicit mixed mocks also require successful startup before mounting App', async () => {
    const {state, done} = runStartup({mocksEnabled: true, start: async () => {throw new Error('mock 不可用');}});
    await done;
    assert.equal(state.appMounts, 0);
    assert.match(state.html, /应用启动失败/);
    assert.equal(state.diagnostics.length, 1);
});

test('local startup waits for the worker before demo login and business pages', async () => {
    let ready;
    const waiting = new Promise(resolve => {ready = resolve;});
    const {state, done} = runStartup({localMode: true, start: () => waiting});
    assert.equal(state.appMounts, 0);
    assert.deepEqual(state.savedTokens, []);
    ready(); await done;
    assert.equal(state.appMounts, 1);
    assert.equal(state.barMounts, 1);
    assert.deepEqual(state.savedTokens, ['local-demo-token']);
});

test('a failed local toolbar import also shows startup feedback without mounting App', async () => {
    const {state, done} = runStartup({localMode: true, barFails: true});
    await done;
    assert.equal(state.appMounts, 0);
    assert.equal(state.diagnostics.length, 0);
    assert.match(state.html, /本地样例启动失败/);
});
