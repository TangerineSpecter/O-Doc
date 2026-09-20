import assert from 'node:assert/strict';
import test from 'node:test';

import {getArticleTemplate, isBlankArticleTemplate, listArticleTemplates} from './articleTemplates.ts';

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
