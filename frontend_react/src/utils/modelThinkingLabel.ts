import type {AIModel} from '../types/api/setting';

/** 展示配置，不把默认行为或未知能力误报为实际开启/关闭。 */
export function modelThinkingLabel(model: AIModel): string {
    const mode = model.thinkingMode || 'default';
    if (model.reasoningEffort && model.reasoningEffort !== 'default') {
        const labels = {none: '关闭', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高'};
        const label = `思考${labels[model.reasoningEffort]}`;
        return model.thinkingCapability?.supported ? label : `${label}配置（能力待确认）`;
    }
    if (mode === 'default') return '思考默认';
    const label = mode === 'enabled' ? '思考开启' : '思考关闭';
    if (model.thinkingCapability?.supported) return label;
    return `${label}配置（能力待确认）`;
}
