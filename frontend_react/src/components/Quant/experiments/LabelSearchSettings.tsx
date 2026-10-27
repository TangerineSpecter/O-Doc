import {QuantField} from '../ui';
export interface LabelSearchDraft {enabled:boolean;horizon:string}
export function LabelSearchSettings({draft,change}:{draft:LabelSearchDraft;change:(value:LabelSearchDraft)=>void}) {
    return <section className="space-y-3 rounded-xl border border-slate-200 p-4"><label className="flex items-start gap-2 text-sm font-medium text-slate-700"><input type="checkbox" className="mt-1 accent-orange-500" checked={draft.enabled} onChange={event=>change({...draft,enabled:event.target.checked})}/>按远期标签选择因子</label>
        {draft.enabled && <><QuantField label="预测未来多少根 K 线（1–2000）" value={draft.horizon} onChange={horizon=>change({...draft,horizon})}/><p className="text-xs leading-6 text-slate-500">目标为未来收盘价 / 当前收盘价 − 1。每个训练、验证和测试窗口先剔除跨界标签起点，至少保留5对；以 Rank IC、覆盖率和复杂度选择，交易收益另列。多内层使用完整窗口均值，测试只在本折选定后评价。</p><p className="text-xs leading-6 text-slate-500">相关系数不是收益或显著性；正负方向按原因子输出，不事后取绝对值或翻转方向。</p></>}
    </section>;
}
