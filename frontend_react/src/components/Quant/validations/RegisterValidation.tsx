import {QuantButton,QuantField,QuantModal} from '../ui';
import {useQuantValidationRegistration} from '../../../hooks/useQuantValidationRegistration';
import {ValidationCriteriaForm} from './ValidationCriteriaForm';
import type {QuantLabelTarget} from '../../../types/api/quantLabels';
export function RegisterValidation({collection,source,attempt,name,close,saved,labelTarget}: {labelTarget?:QuantLabelTarget;collection: string;source: string;attempt: string;name: string;close: ()=>void;saved: (id: string)=>void}) {
    const state=useQuantValidationRegistration(collection,source,attempt,name,saved,labelTarget);
    const {form,busy,error}=state;
    return <QuantModal title="登记固定验证方案" close={close} busy={busy} footer={<div className="flex flex-wrap justify-end gap-2"><QuantButton onClick={close} disabled={busy}>取消</QuantButton><QuantButton primary disabled={busy} onClick={()=>void state.submit()}>{busy?'正在登记…':'冻结并登记'}</QuantButton></div>}>
        <fieldset disabled={busy} className="min-w-0 space-y-4"><p className="text-sm leading-7 text-slate-500">冻结 {attempt} 已实际评价的公式、参数和费用。先登记，再导入后续行情；评价时按首个新开盘固定起点，不搜索或重选参数。</p>
            {Object.entries({name:'验证名称',symbol:'验证标的（留空继承原实验）',timeframe:'K线周期（留空继承原实验）',intervals:'收益区间数量（5–2000）',seconds:'本机计算预算（1–60秒）'}).map(([key,label])=><QuantField key={key} label={label} value={form[key as keyof typeof form]} onChange={value=>state.update(key as keyof typeof form,value)}/>)}
            <ValidationCriteriaForm enabled={state.enabled} value={state.criteria} toggle={state.toggle} change={state.updateCriterion}/>
            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={state.labelEnabled} disabled={!!labelTarget} onChange={event=>state.toggleLabel(event.target.checked)}/>{labelTarget?'沿用来源的远期标签目标':'同时登记远期收益标签'}</label>
                {state.labelEnabled && <><QuantField label="预测未来多少根 K 线（1–2000）" value={state.horizon} onChange={state.updateHorizon}/><p className="text-xs leading-6 text-slate-500">按未来收盘价 / 当前收盘价 − 1 计算标签；段末跨界的起点先剔除，至少保留5对。标签 IC 与交易收益分开展示，登记后不能事后改变期限。</p></>}
            </div>
            <p className="text-xs leading-6 text-slate-500">来源行情最后时间是固定截止点。可登记其他标的或周期，须与随后导入的数据精确一致；登记后导入不等于外部未使用过。</p>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </fieldset>
    </QuantModal>;
}
