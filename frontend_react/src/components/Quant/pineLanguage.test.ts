import assert from 'node:assert/strict';
import test from 'node:test';
import { Compartment, EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import { python } from '@codemirror/lang-python';
import { pineLanguage } from './pineLanguage';
import {tongdaxinLanguage} from './tongdaxinLanguage';
import {cpp} from '@codemirror/lang-cpp';
import { pineSample } from '../../mocks/quant/fixtures';

function tokens(state: EditorState) {
    const result: { text: string; classes: string }[] = [];
    // EditorState's eager parse has a small time budget. Complete it explicitly
    // before checking token coverage under a busy parallel test runner.
    const tree = ensureSyntaxTree(state, state.doc.length, 1000);
    assert.ok(tree, 'syntax tree must cover the complete fixture');
    highlightTree(tree, classHighlighter, (from, to, classes) => {
        result.push({ text: state.sliceDoc(from, to), classes });
    });
    return result;
}

test('通达信和 MQL4 代码预览有注释、函数、数字与类型高亮', () => {
    const tdx = tokens(EditorState.create({doc: '{ source }\nP0:=20;\nFACTOR:IF(CLOSE>REF(CLOSE,P0),1,DRAWNULL);', extensions: [tongdaxinLanguage]}));
    assert.ok(tdx.some(token => token.classes.includes('comment')));
    assert.ok(tdx.some(token => token.text === '20' && token.classes.includes('number')));
    assert.ok(tdx.some(token => token.text === 'REF' && token.classes.includes('variableName')));
    const mql = tokens(EditorState.create({doc: '// source\ninput int window = 20;\ndouble value = 1.5;', extensions: [cpp()]}));
    assert.ok(mql.some(token => token.text === '// source' && token.classes.includes('comment')));
    assert.ok(mql.some(token => token.text === '20' && token.classes.includes('number')));
    assert.ok(mql.some(token => token.text === 'double' && token.classes.includes('typeName')));
});

test('Pine highlights version comments, strings, keywords, functions and numeric literals', () => {
    const code = `//@version=2
strategy("URL // stays in string", overlay=true)
var float value = 1.2e-3
if close > value
    strategy.entry('Long', strategy.long) // entry
shade = #FFAA0080`;
    const highlighted = tokens(EditorState.create({ doc: code, extensions: [pineLanguage] }));
    for (const [text, style] of [
        ['//@version=2', 'comment'], ['"URL // stays in string"', 'string'],
        ["'Long'", 'string'], ['var', 'keyword'], ['if', 'keyword'],
        ['float', 'typeName'], ['true', 'bool'], ['1.2e-3', 'number'],
        ['#FFAA0080', 'number'], ['// entry', 'comment'], ['strategy', 'variableName'],
    ]) {
        assert.ok(highlighted.some((token) => token.text === text && token.classes.includes(style)), text);
    }
});

test('switching an existing editor from Python to Pine highlights the local sample', () => {
    const language = new Compartment();
    let state = EditorState.create({ doc: pineSample, extensions: [language.of(python())] });
    state = state.update({ effects: language.reconfigure(pineLanguage) }).state;
    const highlighted = tokens(state);
    assert.ok(highlighted.some((token) => token.text === '//@version=6' && token.classes.includes('comment')));
    assert.ok(highlighted.some((token) => token.text === '"Momentum research"' && token.classes.includes('string')));
    assert.ok(highlighted.some((token) => token.text === '20' && token.classes.includes('number')));
});
