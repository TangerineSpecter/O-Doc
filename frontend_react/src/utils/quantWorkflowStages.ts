import type {ResearchStage} from '../types/api/quantWorkflow';

export const quantStagePurpose: Record<ResearchStage, string> = {
    normalize: '保存源码、作者说明和输入资料',
    identify: '识别名称、类型和计算用途',
    snippets: '按源码组件梳理计算依赖',
    parameters: '读取默认参数，解释含义与变化影响',
    research: '说明做什么、怎么算、公式与使用方法',
    extract: '提取中文命名的因子、公式和完整代码',
    repair: '补全本次提取的计算定义',
    compare: '查找已有算法与相关实验记录',
    review: '生成五维研究评分和依据',
    plan: '给出数据、参数比较及实验步骤',
    publish: '保存结果；已有正文的变化进入更新对比',
};
