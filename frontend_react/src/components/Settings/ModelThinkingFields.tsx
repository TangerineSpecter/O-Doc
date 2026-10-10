import {Select} from '../common/Select';
import type {ThinkingCapability, ThinkingMode, ThinkingProtocol} from '../../types/api/setting';

interface Props {
    mode: ThinkingMode;
    protocol: ThinkingProtocol;
    onModeChange: (mode: ThinkingMode) => void;
    onProtocolChange: (protocol: ThinkingProtocol) => void;
    capability: {loading: boolean; data?: ThinkingCapability; error?: string};
    manualProtocol: boolean;
}

export function ModelThinkingFields({mode, protocol, onModeChange, onProtocolChange, capability, manualProtocol}: Props) {
    return <div className="space-y-3 border-t border-slate-100 pt-4">
        {capability.data?.supported && <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">思考模式</label>
            <Select<ThinkingMode> value={mode} onChange={onModeChange} menuPortal options={[
                {value: 'default', label: '默认', description: '沿用现有任务与服务商默认行为'},
                {value: 'enabled', label: '开启'}, {value: 'disabled', label: '关闭'},
            ]}/>
            <p className="text-xs text-slate-400 mt-1.5">开启或关闭应用于此模型的聊天与 Agent 任务；聊天窗口的思考开关仅控制内容展示。</p>
        </div>}
        {!capability.data?.supported && <p className="text-xs text-slate-500" role="status">
            {capability.loading ? '正在确认模型思考能力…' : capability.error || capability.data?.reason}
        </p>}
        {!manualProtocol && protocol !== 'auto' && <button type="button"
            className="text-xs text-orange-600 hover:text-orange-700" onClick={() => onProtocolChange('auto')}>
            恢复自动识别
        </button>}
        {manualProtocol && <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">思考参数协议</label>
            <Select<ThinkingProtocol> value={protocol} onChange={onProtocolChange} menuPortal options={[
                {value: 'auto', label: '尚未确认上游协议'},
                {value: 'thinking', label: 'DeepSeek / thinking.type'},
                {value: 'enable_thinking', label: 'Qwen / enable_thinking'},
                {value: 'adaptive', label: 'MiniMax M3 / adaptive'},
                {value: 'reasoning_effort', label: 'reasoning_effort（需支持 none）'},
                {value: 'unsupported', label: '不支持控制'},
            ]}/>
            <p className="text-xs text-slate-400 mt-1.5">中转或自定义模型需按服务商文档选择协议。仅支持思考的模型无法关闭；配置不受支持时请求会报错。</p>
        </div>}
    </div>;
}
