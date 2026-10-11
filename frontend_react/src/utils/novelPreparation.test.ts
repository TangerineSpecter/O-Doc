import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clearSavedPreparation, preparationForm} from './novelPreparation.ts';
import type {PreparationForm} from './novelPreparation.ts';

const novel: PreparationForm = {
    title: '旧书名', direction: '寻找兄长', blueprint: '启程、追索、选择',
    style: '克制具体', setup: {genre: '悬疑', pov: '第三人称'},
};

test('model responses and task refreshes preserve unsaved preparation fields', () => {
    const edits = {title: '未保存的新书名', direction: '', setup: {genre: '历史悬疑'}};
    const refreshed = {...novel, setup: {...novel.setup, pov: '第一人称'}};
    const form = preparationForm(refreshed, edits);
    assert.equal(form.title, '未保存的新书名');
    assert.equal(form.direction, '');
    assert.deepEqual(form.setup, {genre: '历史悬疑', pov: '第一人称'});
    assert.equal(form.blueprint, novel.blueprint);
});

test('successful saves release submitted fields to subsequent server updates', () => {
    const edits = {title: '新书名', setup: {genre: '历史悬疑'}};
    const submitted = preparationForm(novel, edits);
    const remaining = clearSavedPreparation(edits, submitted);
    assert.deepEqual(remaining, {});
    assert.equal(preparationForm({...submitted, title: '作者采用的候选书名'}, remaining).title, '作者采用的候选书名');
    assert.deepEqual(edits, {title: '新书名', setup: {genre: '历史悬疑'}});
});

test('typing during a save preserves later edits while clearing the saved inputs', () => {
    const submitted = preparationForm(novel, {title: '已提交书名', setup: {genre: '历史悬疑'}});
    const current = {title: '保存期间继续输入', style: '更简练', setup: {genre: '历史悬疑', pov: '第二人称'}};
    const remaining = clearSavedPreparation(current, submitted);
    assert.deepEqual(remaining, {title: '保存期间继续输入', style: '更简练', setup: {pov: '第二人称'}});
    assert.deepEqual(preparationForm(submitted, remaining).setup, {genre: '历史悬疑', pov: '第二人称'});
});
