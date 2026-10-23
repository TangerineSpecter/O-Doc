const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../decision-debugger-input.js');
const {parseImport, buildDecision} = globalThis.DecisionDebuggerInput;

const decision = {
  state: {needs: [{sku: 'ore', missing_quantity: 12}], energy_allowance: 100},
  questions: {life_interleaving: {type: 'choice', instructions: '从合法选项选择',
    criteria: {exploration: {durations_minutes: [30, 60], remaining_minutes: 120}, wait: '暂不活动'}}}
};

test('round trips structured state and mixed option types without converting them to strings', () => {
  assert.deepEqual(buildDecision(parseImport(JSON.stringify(decision))), decision);
});

test('imports the actual Chat Completions content and model, ignoring wrapper connection and secrets', () => {
  const body = {model: 'test-decision', messages: [{role: 'user', content: JSON.stringify(decision)}]};
  const config = parseImport(JSON.stringify({method: 'POST', url: 'https://untrusted.invalid', headers: {Authorization: 'secret'}, json: body}));
  assert.equal(config.model, 'test-decision');
  assert.equal(config.endpoint, undefined);
  assert.equal(config.apiKey, undefined);
  assert.deepEqual(buildDecision(config), decision);
});

test('keeps plain text and JSON-looking strings as text, including whitespace', () => {
  const value = structuredClone(decision);
  value.state = ' {"looks":"like JSON"} ';
  value.questions.life_interleaving.criteria.wait = ' 休息 ';
  assert.deepEqual(buildDecision(parseImport(JSON.stringify(value))), value);
});

test('preserves primitive, null and array criteria', () => {
  const value = structuredClone(decision);
  value.state = null;
  value.questions.life_interleaving.criteria = {zero: 0, yes: true, empty: null, list: [1, 2]};
  assert.deepEqual(buildDecision(parseImport(JSON.stringify(value))), value);
});

test('rejects unsupported envelopes and multiple questions instead of silently dropping input', () => {
  assert.throws(() => parseImport('{'), /JSON/);
  assert.throws(() => parseImport('{}'), /state/);
  const value = structuredClone(decision);
  value.questions.another = structuredClone(value.questions.life_interleaving);
  assert.throws(() => parseImport(JSON.stringify(value)), /一个问题/);
  assert.throws(() => parseImport(JSON.stringify({model: 'x', messages: [{role: 'system', content: 'rules'}, {role: 'user', content: JSON.stringify(decision)}]})), /user/);
  assert.throws(() => parseImport(JSON.stringify({model: 'x', temperature: 0, messages: [{role: 'user', content: JSON.stringify(decision)}]})), /额外参数/);
});

test('rejects invalid questions and empty or oversized option lists', () => {
  for (const criteria of [{}, Object.fromEntries(Array.from({length: 256}, (_, i) => ['key' + i, 'x'])), {' bad ': 'x'}]) {
    const value = structuredClone(decision);
    value.questions.life_interleaving.criteria = criteria;
    assert.throws(() => parseImport(JSON.stringify(value)));
  }
  const value = structuredClone(decision);
  value.questions.life_interleaving.type = 'text';
  assert.throws(() => parseImport(JSON.stringify(value)), /choice/);
});

test('reports malformed edited JSON at send time with the affected field', () => {
  const config = parseImport(JSON.stringify(decision));
  config.state = '{';
  assert.throws(() => buildDecision(config), /State/);
  config.state = '{}';
  config.options[0].label = '{';
  assert.throws(() => buildDecision(config), /exploration/);
});
