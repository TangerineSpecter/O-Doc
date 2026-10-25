import {useState} from 'react';
import type {QuantExecutionAdapter, QuantExecutionOptions} from '../../../../types/api/quantPlatformEvidence';
import {executionAdapters, readExecutionOptions} from '../../../../utils/quantPlatformEvidence';
import {executionTemplate, type ExecutionSample} from '../../../../utils/quantExecutionTemplates';
import type {useQuantPlatformEvidence} from '../../../../hooks/useQuantPlatformEvidence';
import {Select} from '../../../common/Select';
import {QuantButton, QuantField} from '../../ui';
import {ExecutionEvidence} from './ExecutionEvidence';

export function ExecutionImport({adapter, optionsJson, document, changeAdapter, changeOptions, changeDocument, preview, allowed}: {
    adapter: QuantExecutionAdapter; optionsJson: string; document: string;
    changeAdapter: (value: QuantExecutionAdapter) => void; changeOptions: (value: string) => void; changeDocument: (value: string) => void;
    preview: ReturnType<typeof useQuantPlatformEvidence>; allowed: boolean;
}) {
    const [sample, setSample] = useState<ExecutionSample>('reconciled');
    const options = readExecutionOptions(optionsJson);
    const patch = <K extends keyof QuantExecutionOptions>(key: K, value: QuantExecutionOptions[K]) => changeOptions(JSON.stringify({...options, [key]: value}));
    return <div className="space-y-4">
        <label className="block space-y-2 text-sm"><span>执行记录格式</span><Select menuPortal value={adapter} onChange={value => changeAdapter(value as QuantExecutionAdapter)} options={Object.entries(executionAdapters).map(([value, label]) => ({value, label}))}/></label>
        <div className="space-y-3 rounded-xl bg-slate-50 p-4"><p className="text-xs leading-6 text-slate-500">标准 JSON 的 metadata、parameters、reported_metrics 和 records 分别保存口径、声明参数、声明指标与逐条记录；数值使用十进制字符串。CSV 使用固定列名，账户口径在下方补充。MT4 仅覆盖受支持的测试器 HTML 表格，不能保证所有版本和导出语言均可识别。</p><div className="flex flex-wrap gap-3"><QuantButton onClick={() => changeDocument(executionTemplate(adapter))}>填入标准模板</QuantButton><div className="min-w-44 flex-1"><Select menuPortal value={sample} onChange={value => setSample(value as ExecutionSample)} options={[{value: 'reconciled', label: '人工样例 · 金额一致'}, {value: 'mismatch', label: '人工样例 · 核算差异'}, {value: 'partial', label: '人工样例 · 口径缺失'}, {value: 'invalid', label: '人工样例 · 无效值'}]}/></div><QuantButton onClick={() => {changeOptions(JSON.stringify({...options, timezone: sample === 'partial' ? '' : 'UTC', currency: 'USD', initial_balance: sample === 'partial' ? '' : '10000', profit_basis: sample === 'partial' ? 'unknown' : 'net', cash_flow_coverage: sample === 'partial' ? 'unknown' : 'complete'})); changeDocument(executionTemplate(adapter, sample));}}>填入人工样例</QuantButton></div></div>
        <QuantField label="原始执行报告文本" required multiline rows={12} value={document} onChange={changeDocument} placeholder="导入文件或粘贴完整原文；最多 1 MiB、2000 条记录。原始顺序和负面成交会保留。"/>
        {document.includes('LOCAL_EXECUTION_') && <p className="text-xs leading-6 text-orange-700">当前是明确标记的人工示例数据，用于检查导入和研究流程，不是平台真实运行记录。</p>}
        <details className="rounded-xl border border-slate-200 p-4" open><summary className="cursor-pointer text-sm font-semibold">核算口径 · 空白保留未知</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
            <QuantField label="账户时区（IANA，可空）" value={options.timezone} onChange={value => patch('timezone', value)} placeholder="例如 UTC / Asia/Shanghai"/>
            <QuantField label="账户币种（可空）" value={options.currency} onChange={value => patch('currency', value)} placeholder="例如 USD"/>
            <QuantField label="起始余额（可空）" value={options.initial_balance} onChange={value => patch('initial_balance', value)} placeholder="例如 10000"/>
            <QuantField label="余额绝对容差" value={options.balance_tolerance} onChange={value => patch('balance_tolerance', value)} placeholder="0.01"/>
            <label className="space-y-2 text-sm"><span className="block">交易利润口径</span><Select menuPortal value={options.profit_basis} onChange={value => patch('profit_basis', value as QuantExecutionOptions['profit_basis'])} options={[{value: 'unknown', label: '未知 / 由文档声明'}, {value: 'net', label: '净额：不重复扣费用'}, {value: 'gross', label: '毛额：需完整费用计算净额'}]}/></label>
            <label className="space-y-2 text-sm"><span className="block">外部现金流覆盖</span><Select menuPortal value={options.cash_flow_coverage} onChange={value => patch('cash_flow_coverage', value as QuantExecutionOptions['cash_flow_coverage'])} options={[{value: 'unknown', label: '未知 / 由文档声明'}, {value: 'complete', label: '声明存取款等已完整提供'}]}/></label>
        </div><p className="mt-3 text-xs leading-6 text-slate-500">选项与文档元数据冲突时会拒绝。佣金、隔夜费和其他费用是有符号现金变化；报告利润已为净额时不重复扣费，毛额只有三类费用齐全时才计算净额。</p></details>
        <div className="flex flex-wrap items-center gap-3"><QuantButton disabled={!allowed || preview.loading} onClick={preview.preview}>{preview.loading ? '解析与核算中…' : preview.started ? '重新预览核算' : '预览解析与核算'}</QuantButton><p className="min-w-0 flex-1 text-xs leading-6 text-slate-500">{preview.valid ? '这份输入已预览，保存时服务器会重新解析并冻结。' : '保存前需成功预览；修改原文、格式、口径或关联来源后需要重新预览。'}</p></div>
        {preview.loading && <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">正在读取记录、核对费用与余额路径，原始材料尚未保存…</p>}
        {preview.error && <p role="alert" className="rounded-xl bg-orange-50 p-4 text-sm leading-7 text-orange-800">{preview.error}</p>}
        {preview.json && <ExecutionEvidence json={preview.json}/>}
    </div>;
}
