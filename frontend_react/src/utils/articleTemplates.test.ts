import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getArticleTemplate,
    isBlankArticleTemplate,
    isUserArticleTemplate,
    listArticleTemplates,
    MAX_USER_ARTICLE_TEMPLATES,
    parseUserArticleTemplates,
    removeUserArticleTemplate,
    saveUserArticleTemplate,
    serializeUserArticleTemplates,
    suggestUserArticleTemplateName,
} from './articleTemplates.ts';

test('lists built-in templates with unique ids and names', () => {
    const templates = listArticleTemplates();
    const ids = templates.map(template => template.id);
    const names = templates.map(template => template.name);

    assert.ok(templates.length >= 5);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(names.every(name => name.trim().length > 0));
    assert.ok(ids.includes('blank'));
    assert.ok(ids.includes('tech-spec'));
    assert.ok(ids.includes('meeting-notes'));
    assert.ok(ids.includes('reading-notes'));
    assert.ok(ids.includes('weekly-report'));
    assert.ok(templates.every(template => template.source === 'builtin'));
});

test('blank template has empty content; others include markdown headings', () => {
    const blank = getArticleTemplate('blank');
    assert.ok(blank);
    assert.equal(isBlankArticleTemplate(blank), true);

    const filled = listArticleTemplates().filter(template => template.id !== 'blank');
    assert.ok(filled.length > 0);
    for (const template of filled) {
        assert.equal(isBlankArticleTemplate(template), false);
        assert.match(template.content, /^## /m);
    }
});

test('unknown template id returns undefined', () => {
    assert.equal(getArticleTemplate('does-not-exist'), undefined);
});

test('parseUserArticleTemplates skips invalid, builtin, and duplicate entries', () => {
    const raw = JSON.stringify([
        {id: 'user-ok', name: '  周报骨架  ', description: '给自己用', content: '## 本周'},
        {id: 'blank', name: '伪装内置', content: 'nope'},
        {id: 'user-ok', name: '重复', content: 'dup'},
        {id: 'not-user', name: '非法前缀', content: 'x'},
        {name: '缺 id', content: 'x'},
        null,
        'oops',
    ]);

    const parsed = parseUserArticleTemplates(raw);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, 'user-ok');
    assert.equal(parsed[0].name, '周报骨架');
    assert.equal(parsed[0].source, 'user');
    assert.equal(parseUserArticleTemplates('not-json').length, 0);
    assert.equal(parseUserArticleTemplates('{"id":"user-x"}').length, 0);
});

test('saveUserArticleTemplate requires a name and appends a user template', () => {
    const missingName = saveUserArticleTemplate([], {name: '  ', content: '## 背景'});
    assert.equal(missingName.ok, false);

    const saved = saveUserArticleTemplate([], {
        name: '  产品方案  ',
        description: '常用骨架',
        content: '## 背景\n',
    }, {id: 'user-spec', now: 1});
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.template.id, 'user-spec');
    assert.equal(saved.template.name, '产品方案');
    assert.equal(saved.template.source, 'user');
    assert.equal(isUserArticleTemplate(saved.template), true);

    const merged = listArticleTemplates(saved.templates);
    assert.equal(getArticleTemplate('user-spec', saved.templates)?.name, '产品方案');
    assert.ok(merged.some(template => template.id === 'user-spec'));
    assert.equal(merged.filter(template => template.source === 'builtin').length, listArticleTemplates().length);
});

test('saveUserArticleTemplate rejects builtin ids and respects the max count', () => {
    const builtinId = saveUserArticleTemplate([], {name: '坏 id', content: 'x'}, {id: 'blank'});
    assert.equal(builtinId.ok, false);

    const existing = Array.from({length: MAX_USER_ARTICLE_TEMPLATES}, (_, index) => ({
        id: `user-${index}`,
        name: `模板 ${index}`,
        description: '',
        content: 'x',
        source: 'user' as const,
    }));
    const overflow = saveUserArticleTemplate(existing, {name: '再来一个', content: 'x'}, {id: 'user-overflow'});
    assert.equal(overflow.ok, false);
});

test('suggestUserArticleTemplateName falls back for untitled documents', () => {
    assert.equal(suggestUserArticleTemplateName(''), '我的模板');
    assert.equal(suggestUserArticleTemplateName('  未命名文档  '), '我的模板');
    assert.equal(suggestUserArticleTemplateName('  Tesla 评测  '), 'Tesla 评测');
});

test('removeUserArticleTemplate only drops the matching user template', () => {
    const first = saveUserArticleTemplate([], {name: 'A', content: 'a'}, {id: 'user-a'});
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = saveUserArticleTemplate(first.templates, {name: 'B', content: 'b'}, {id: 'user-b'});
    assert.equal(second.ok, true);
    if (!second.ok) return;

    const remaining = removeUserArticleTemplate(second.templates, 'user-a');
    assert.deepEqual(remaining.map(template => template.id), ['user-b']);
    assert.equal(serializeUserArticleTemplates(remaining).includes('user-a'), false);
});
