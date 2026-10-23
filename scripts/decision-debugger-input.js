/* Shared by the file:// debugger and its Node regression tests. No network or storage. */
(() => {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const parse = text => {
    try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (_) { throw new Error('JSON 格式无效，请检查文件或粘贴内容。'); }
  };

  function parseImport(text) {
    let decision = parse(text);
    let model;
    if (object(decision) && object(decision.json)) decision = decision.json;
    if (object(decision) && Array.isArray(decision.messages)) {
      if (decision.messages.length !== 1 || decision.messages[0]?.role !== 'user' || typeof decision.messages[0].content !== 'string') {
        throw new Error('请求体须只有一条 user 消息；请导入原始 state + questions，避免丢失历史或系统提示。');
      }
      if (Object.keys(decision).some(key => !['model', 'messages'].includes(key))) {
        throw new Error('请求体含额外参数，请改为导入 state + questions；当前表单只编辑 model 和单条决策消息。');
      }
      if (typeof decision.model !== 'string' || !decision.model.trim()) throw new Error('请求体缺少有效的模型 ID。');
      model = decision.model;
      decision = parse(decision.messages[0].content);
    }
    if (!object(decision) || !Object.hasOwn(decision, 'state') || !object(decision.questions)) {
      throw new Error('需要包含 state 和 questions 的决策 JSON，或对应的 Chat Completions 请求体。');
    }
    const entries = Object.entries(decision.questions);
    if (entries.length !== 1) throw new Error('当前调试台一次测试一个问题，请仅保留一个 questions 条目。');
    const [questionId, question] = entries[0];
    if (!questionId.trim() || questionId !== questionId.trim() || !object(question) || question.type !== 'choice') throw new Error('问题 ID 不能为空或带首尾空格，问题类型须为 choice。');
    if (typeof question.instructions !== 'string' || !question.instructions.trim()) throw new Error('问题说明 instructions 不能为空。');
    if (!object(question.criteria)) throw new Error('候选选项 criteria 须为对象。');
    const criteria = Object.entries(question.criteria);
    if (!criteria.length || criteria.length > 255) throw new Error('候选选项须为 1～255 项。');
    if (criteria.some(([key, value]) => !key.trim() || key !== key.trim() || (typeof value === 'string' && !value.trim()))) {
      throw new Error('候选 key 不能为空或带首尾空格，文本候选内容不能为空。');
    }
    return {
      ...(model === undefined ? {} : {model}),
      state: typeof decision.state === 'string' ? decision.state : JSON.stringify(decision.state, null, 2),
      stateType: typeof decision.state === 'string' ? 'text' : 'json',
      questionId, instructions: question.instructions,
      options: criteria.map(([key, value]) => ({key,
        label: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
        valueType: typeof value === 'string' ? 'text' : 'json'}))
    };
  }

  function buildDecision(config) {
    const criteria = Object.fromEntries(config.options.map(option => {
      let value = option.label;
      if (option.valueType === 'json') {
        try { value = JSON.parse(option.label); }
        catch (_) { throw new Error(`候选 ${option.key} 的 JSON 格式无效。`); }
      }
      return [option.key, value];
    }));
    let state = config.state;
    if (config.stateType === 'json') {
      try { state = JSON.parse(state); }
      catch (_) { throw new Error('State 的 JSON 格式无效。'); }
    }
    return {state, questions: {[config.questionId]: {type: 'choice', instructions: config.instructions, criteria}}};
  }

  globalThis.DecisionDebuggerInput = Object.freeze({parseImport, buildDecision});
})();
