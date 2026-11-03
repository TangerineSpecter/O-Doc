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

function loadComponent(name, stubs) {
    const source = readFileSync(new URL(`../src/components/Diary/${name}.tsx`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, {compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    }}).outputText;
    const exports = {};
    runInNewContext(code, {exports, require(module) {
        if (['react', 'react/jsx-runtime', 'lucide-react'].includes(module)) return require(module);
        if (module in stubs) return stubs[module];
        throw new Error(`Unexpected import: ${module}`);
    }});
    return exports.default;
}

test('桌面和移动版同时存在时，各自标签关联到独立输入框', () => {
    const Tags = loadComponent('DiaryTagsInput', {'./diaryTags': {mergeDiaryTags: noop}});
    const props = {tags: [], onChange: noop, input: '', onInputChange: noop};
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
        React.createElement(Tags, {...props, layout: 'sidebar'}),
        React.createElement(Tags, props)));
    const labels = [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map(match => match[1]);
    const inputs = [...html.matchAll(/<input\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(labels.length, 2);
    assert.deepEqual(labels, inputs);
    assert.notEqual(labels[0], labels[1]);
});

test('桌面和移动配图区都在上传入口旁显示关联的错误', () => {
    const ImageUpload = loadComponent('DiaryImageUpload', {
        '../../utils/imageUpload': {collectDroppedFiles: noop},
        './DiaryPhoto': {default: noop},
        './DiaryLibraryPicker': {default: noop},
        './diaryImages': {MAX_DIARY_IMAGES: 15, diaryImagePatch: noop},
    });
    for (const layout of ['sidebar', 'default']) {
        const html = renderToStaticMarkup(React.createElement(ImageUpload, {
            draft: {imageAssetIds: [], coverUrl: ''}, onChange: noop, onUpload: noop,
            uploading: false, error: '图片上传失败，请重试', layout,
        }));
        const alert = html.match(/<p\b(?=[^>]*\brole="alert")(?=[^>]*\bid="([^"]+)")[^>]*>([^<]+)<\/p>/);
        assert.ok(alert, `missing upload alert for ${layout}`);
        assert.equal(alert[2], '图片上传失败，请重试');
        assert.deepEqual([...html.matchAll(/aria-describedby="([^"]+)"/g)].map(match => match[1]), [alert[1], alert[1]]);
    }
});
