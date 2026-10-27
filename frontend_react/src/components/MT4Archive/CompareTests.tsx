import {useState} from 'react';
import type {MT4Test} from '../../types/api/mt4Archive';
import {reportMetric} from '../../utils/mt4Report';
import {QuantButton, QuantModal} from '../Quant/ui';

export function CompareTests({tests, close}: {tests: MT4Test[]; close: () => void}) {
    const [selected, setSelected] = useState<string[]>(tests.slice(0, 2).map(test => test.id));
    const chosen = tests.filter(test => selected.includes(test.id));
    const rows: {name: string; value: (test: MT4Test) => string}[] = [
        {name: '交易品种', value: test => test.data.fields?.symbol || '—'},
        {name: '周期与区间', value: test => test.data.fields?.period || '—'},
        {name: '复盘模型', value: test => test.data.fields?.model || '—'},
        {name: '参数', value: test => test.data.parameters?.map(p => `${p.label || p.name}=${p.value}`).join('；') || '—'},
        ...[
            ['初始资金', '起始资金', 'initial deposit'], ['点差', '点差', 'spread'], ['净盈利', '总净盈利', 'total net profit'],
            ['最大回撤', '最大亏损', 'maximal drawdown'], ['交易数', '交易单总计', 'total trades'], ['模型质量', '复盘模型的质量', 'modelling quality'],
        ].map(([name, zh, en]) => ({name, value: (test: MT4Test) => reportMetric(test.data, [zh, en]) || '—'})),
    ];
    return <QuantModal title="对比回测" close={close} wide footer={<QuantButton onClick={close}>关闭</QuantButton>}>
        <p className="text-xs text-slate-500">选择最多四条记录，比较测试条件、参数和报告指标。</p>
        <div className="my-3 flex flex-wrap gap-3">{tests.map(test => <label key={test.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={selected.includes(test.id)} disabled={selected.length >= 4 && !selected.includes(test.id)} onChange={event => setSelected(current => event.target.checked ? [...current, test.id] : current.filter(id => id !== test.id))}/>{test.title}</label>)}</div>
        {chosen.length ? <div className="overflow-x-auto scrollbar-hide"><table className="w-full min-w-[500px] text-sm"><thead><tr><th className="border-b border-slate-200 px-3 py-2 text-left text-slate-500">项目</th>{chosen.map(test => <th key={test.id} className="border-b border-slate-200 px-3 py-2 text-left">{test.title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.name} className="border-b border-slate-100"><th className="px-3 py-2 text-left font-medium text-slate-500">{row.name}</th>{chosen.map(test => <td key={test.id} className="min-w-40 px-3 py-2 align-top tabular-nums">{row.value(test)}</td>)}</tr>)}</tbody></table></div> : <p className="py-5 text-sm text-slate-500">请选择需要比较的回测。</p>}
    </QuantModal>;
}
