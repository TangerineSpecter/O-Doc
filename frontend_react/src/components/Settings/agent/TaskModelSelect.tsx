import {SettingsSelect, type SettingsSelectOption} from '../SettingsSelect';

export function TaskModelSelect({value, options, onChange}: {
    value: string;
    options: SettingsSelectOption<string>[];
    onChange: (value: string) => void;
}) {
    const choices: SettingsSelectOption<string>[] = [{value: '', label: '继承 Agent 模型', description: '使用各执行 Agent 的模型及思考配置'}, ...options];
    if (value && !options.some(option => option.value === value)) {
        choices.push({value, label: '已配置模型（当前不可用）'});
    }
    return <label className="block space-y-2 text-sm text-slate-700">
        <span>任务执行模型</span>
        <SettingsSelect menuPortal={true} value={value} options={choices} onChange={onChange}/>
        <p className="text-xs leading-relaxed text-slate-400">继承时使用各执行 Agent 的默认模型；指定时，本任务及其后续执行统一使用所选模型，身份与记忆仍属于原 Agent。生图模型单独配置。</p>
    </label>;
}
