import {Select} from '../common/Select';
import type {ModelType} from '../../types/api/setting';
import {OPENAI_MODEL_OPTIONS} from './openaiModelCatalog';

interface Props {
    type: ModelType;
    name: string;
    custom: boolean;
    onSelect: (name: string, custom: boolean) => void;
}

export function OpenAIModelSelector({type, name, custom, onSelect}: Props) {
    const options = OPENAI_MODEL_OPTIONS[type];
    const selected = custom ? '__custom__' : options.some(item => item.value === name) ? name : '';
    return <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-600">OpenAI 模型</label>
        <Select<string> ariaLabel="OpenAI 模型" menuPortal value={selected} placeholder="选择模型" onChange={value => onSelect(value === '__custom__' ? '' : value, value === '__custom__')}
            options={[...options.map(option => ({...option, description: option.value})), {value: '__custom__', label: '自定义模型 ID'}]}/>
        {custom && <input type="text" aria-label="自定义模型 ID" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
            placeholder="输入 OpenAI 模型 ID" value={name} onChange={event => onSelect(event.target.value, true)}/>}
        <p className="text-[10px] leading-4 text-slate-400">可用模型取决于 API 账号权限。{type === 'image_generation' ? '当前支持文字生图，图片尺寸由模型自动决定；参考图编辑暂未接入。' : type === 'rerank' ? '暂无预置重排模型，可填写自定义 ID。' : '列表为常用模型，其他型号可选自定义。'}</p>
    </div>;
}
