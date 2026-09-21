import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPromptTemplate} from './promptRenderer';

const fields = [
  {key: 'title', label: '标题', type: 'text' as const, required: true, defaultValue: '', placeholder: ''},
  {key: 'ratio', label: '比例', type: 'select' as const, required: false, defaultValue: '3:4', placeholder: '', options: [{label: '3:4', value: '3:4'}]},
  {key: 'styles', label: '风格', type: 'multiselect' as const, required: false, defaultValue: [], placeholder: '', separator: '、', options: []},
];

test('renders Chinese values and retains ordinary braces', () => {
  const result = renderPromptTemplate(' {{title}} / {{field:ratio}} / {{keep}} ', fields, {title: '橘子海报'});
  assert.equal(result.text, '{{title}} / 3:4 / {{keep}}');
});
test('reports missing required values and joins multiselect', () => {
  const result = renderPromptTemplate('{{field:title}} {{field:styles}}', fields, {styles: ['极简', '水彩']});
  assert.deepEqual(result.missing, ['标题']);
  assert.equal(result.text, '极简、水彩');
});
