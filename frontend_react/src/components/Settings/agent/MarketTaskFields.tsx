import {Select} from '../../common/Select';
import {Checkbox} from '../../common/Checkbox';
import {useDecisionConfig} from '../../../hooks/useDecisionConfig';
import type {MarketDecisionConfig} from '../../../types/api/decision';

export function MarketTaskFields({value, onChange}: {value: MarketDecisionConfig; onChange: (value: MarketDecisionConfig) => void}) {
    const {config, loading, error, refresh} = useDecisionConfig();
    const configured = config?.providers.find(provider => provider.id === 'jev')?.configured;
    return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm leading-relaxed text-slate-600">居民自主决定是否逛市场，进入消耗5体力；可买卖、上架、改价、撤单并调整种植队列。最多5分钟、20次市场工具调用。</p>
        <Checkbox checked={value.decisionEnabled ?? false} onChange={decisionEnabled => onChange({...value, decisionEnabled, decisionProvider: value.decisionProvider || 'jev'})} label="使用决策模型"/>
        {value.decisionEnabled && <><label className="block space-y-2 text-sm text-slate-700"><span>决策模型</span><Select menuPortal={true} value={value.decisionProvider || 'jev'} options={[{value: 'jev', label: 'JEV'}]} onChange={() => onChange({...value, decisionProvider: 'jev'})}/></label>
            {loading ? <p className="text-xs text-slate-500">正在读取本机配置…</p> : error ? <p className="text-xs text-red-600">{error}<button type="button" onClick={() => void refresh()} className="ml-2 underline">重试</button></p> : !configured && <p className="text-xs leading-relaxed text-orange-600">本机尚未配置 JEV 密钥，请在 AI 模型接入 → 决策模型填写；未配置时自动使用文本模型。</p>}
            <p className="text-xs leading-relaxed text-slate-500">JEV 选择常规交易，复杂操作按需使用任务执行模型。JEV 不可用时，文本模型会从当前状态继续，不重复成交。</p></>}
    </section>;
}
