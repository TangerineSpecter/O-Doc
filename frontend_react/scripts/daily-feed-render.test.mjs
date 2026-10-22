import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/components/AgentWorld/DailyFeedTimeline.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const stub = () => null;
const children = new Set([
    './ExecutionFeedSteps', './ExplorationFeedSettlement', '../AgentPost/PostRatingBadge',
    './AgentActivityCard', './AgentActivitySummary', './AgentAvatar', './DailyFinanceFeed', '../common/StarLoader',
]);

// Render the real timeline and event cards; isolate API hooks and unrelated child widgets.
function render(category, target = null) {
    const event = {
        id: 'sample', category, source: category, actorId: 'resident', actorName: '测试居民',
        occurredAt: '2026-10-22T08:00:00+08:00', title: '测试活动', detail: '',
        status: 'success', amount: null, target,
    };
    const exports = {};
    runInNewContext(code, {exports, require(name) {
        if (['react', 'react/jsx-runtime', 'lucide-react'].includes(name)) return require(name);
        if (name === '../../hooks/useDailyFeed') return {
            shanghaiDay: () => '2026-10-22',
            useDailyFeed: () => ({items: [event], result: null, loading: false, error: '', reload: stub}),
        };
        if (name === '../../hooks/useHorizontalWheelScroll') return {default: stub};
        if (name === '../Combat/observationRecords') return {parseSettlementReport: stub};
        if (children.has(name)) return {default: stub, ExecutionFeedSteps: stub, ExplorationFeedSettlement: stub};
        throw new Error(`Unexpected import: ${name}`);
    }});
    return renderToStaticMarkup(React.createElement(exports.default, {actorId: '', residents: [], onOpen: stub}));
}

test('alchemy activity renders its category, filter and catalog action', () => {
    const html = render('alchemy', {kind: 'alchemy', id: 'operation'});
    assert.match(html, /role="tab"[^>]*>[\s\S]*?炼金<\/button>/);
    assert.match(html, /bg-purple-50 text-purple-700/);
    assert.match(html, /查看药水/);
    assert.match(html, /测试活动/);
});

test('an unknown server category preserves the activity with a neutral badge', () => {
    const html = render('future_category');
    assert.match(html, /bg-slate-100 text-slate-700/);
    assert.match(html, /future_category/);
    assert.match(html, /测试活动/);
});

test('every category declared by the backend renders and has a frontend filter', () => {
    const backend = readFileSync(new URL('../../system_settings/agent_world/daily_feed.py', import.meta.url), 'utf8');
    const declaration = backend.match(/^CATEGORIES = \{([^}]+)\}/m);
    assert.ok(declaration, 'backend category declaration must be found');
    for (const [, category] of declaration[1].matchAll(/'([^']+)'/g)) {
        assert.doesNotThrow(() => render(category), category);
        assert.match(source, new RegExp(`value: '${category}'`), `missing filter: ${category}`);
    }
});
