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

test('完整导读按作用、计算、公式、输出、参数、使用保留，修订不丢节', () => {
    const sections = ['这个指标做什么', '它是怎么计算的', '关键公式与解读', '输出怎么看', '主要参数', '怎么使用'];
    const reading = sections.map(title => `## ${title}\n\n${title}的说明`).join('\n\n');
    assert.equal(logicReportBody(`## 研究质量评价\n\n评分\n\n${reading}\n\n## 来源事实\n\n依据`, false), reading);
    assert.equal(logicReportBody(reading, true), reading);
});
