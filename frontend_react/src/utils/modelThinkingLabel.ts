import type {AIModel} from '../types/api/setting';

/** 展示配置，不把默认行为或未知能力误报为实际开启/关闭。 */
export function modelThinkingLabel(model: AIModel): string {
    const mode = model.thinkingMode || 'default';
    if (mode === 'default') return '思考默认';
    const label = mode === 'enabled' ? '思考开启' : '思考关闭';
    if (model.thinkingCapability?.supported) return label;
    return `${label}配置（能力待确认）`;
}
