import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { logicReportBody } from './quantLogicReport.ts';

test('original source report shows explanation sections without audit boilerplate', () => {
    const original = '# 标题\n\n摘要\n\n## 问题清单与严重度\n\n审查\n\n## 研究质量评价\n\n分数\n\n## 原理与计算逻辑\n\n第一步\n```text\n## 不是真正的标题\n```\n\n## 公式\n\nx + 1\n\n## 用途与条件\n\n参考\n\n## 输入参数与建议\n\n参数';
    const result = logicReportBody(original, false);
    assert.match(result, /第一步/);
    assert.match(result, /## 不是真正的标题/);
    assert.match(result, /x \+ 1/);
    assert.match(result, /参考/);
    assert.doesNotMatch(result, /问题清单|研究质量评价|输入参数与建议/);
    assert.equal(logicReportBody(original, true), original);
    assert.equal(logicReportBody('用户自定义报告', false), '用户自定义报告');
    assert.equal(logicReportBody('摘要\n\n## 计算原理\n说明\n\n## 问题清单与严重度\n问题', false), '## 计算原理\n说明');
});
