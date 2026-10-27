import {readGraphResearch} from '../../../utils/quantGraphResearch';
import type {GraphResearch, GraphCombinationObservation} from '../../../types/api/quantGraphResearch';
import {WindowPart} from '../experiments/CombinationAnalysis';
import {QuantButton} from '../ui';
import {attemptNames} from '../experiments/readout';

const statusNames = {supports: '满足本样本描述规则', counterexample: '本样本反例', unknown: '证据不足', mixed: '跨窗分歧或缺测',
    hypothesis: '待检验假设', reported_support: '反馈支持主张 · 未核实', reported_counterexample: '反馈反例主张 · 未核实'};
function Observations({value}: {value: GraphCombinationObservation}) {
    const group = value.analysis.groups[0];
    return <div className="space-y-3">
        <p className="text-xs leading-6 text-slate-600">固定描述规则：组合有入场、验证净收益为正且高于两个直接父代，同时回撤和换手不高于两者较低值。按事后规则整理观察，未预先登记，也不证明一般互补或独立有效。</p>
        <p className="break-words text-xs leading-6 text-slate-500">{value.market.symbol || '标的未知'} / {value.market.timeframe || '周期未知'} · 每侧费用 {value.config.fee_bps} bps、滑点 {value.config.slippage_bps} bps{group.outer_fold ? ` · 外折 ${group.outer_fold}` : ''}。完整成交及风控设定见原实验。</p>
        <div className="grid grid-cols-3 gap-2 text-xs">{(['supports', 'counterexample', 'unknown'] as const).map(status => <div key={status} className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">{{supports: '支持', counterexample: '反例', unknown: '未知'}[status]}窗口</p><p className="mt-1 text-base font-semibold text-slate-700">{value.outcomes.filter(row => row.status === status).length}</p></div>)}</div>
        {value.ai_interpretation && <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-3"><p className="mb-1 text-xs font-medium text-orange-800">原报告中的 AI 解读</p><p className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">{value.ai_interpretation.text}</p></div>}
        <details className="min-w-0 text-xs"><summary className="cursor-pointer text-orange-700">全部窗口与实际父代参数</summary><div className="mt-3 space-y-3">
            {value.configurations.map((row, index) => <div key={`${index}-${row.attempt_id}`} className="rounded-lg bg-slate-50 p-3 leading-6 text-slate-600"><p className="font-medium">{index < 2 ? `父代 ${index + 1}` : '组合'} · {row.attempt_id} · {attemptNames[row.status] || row.status}</p><p className="break-all">{row.parameters.map(p => `${p.original_name}=${JSON.stringify(p.value)}`).join('；') || '无已记录参数'}</p><p className="break-all">输入映射：{JSON.stringify(row.bindings)}</p></div>)}
            {group.windows.map((window, index) => <div key={window.inner_fold ?? 'single'} className="space-y-2"><p className="text-xs font-semibold text-slate-700">{window.inner_fold ? `内层 ${window.inner_fold}` : '固定窗口'} · {statusNames[value.outcomes[index].status]}</p><div className="grid min-w-0 gap-3 xl:grid-cols-2"><WindowPart value={window.parts.train} title="训练背景"/><WindowPart value={window.parts.validation} title="验证对照"/></div></div>)}
        </div></details>
    </div>;
}
function Content({value, focus, available, current}: {value: GraphResearch; focus: (id: string) => void; available: string[]; current: string}) {
    if (value.kind === 'combination_observation') return <Observations value={value}/>;
    if (value.kind === 'scenario_hypothesis') return <div className="space-y-2 text-xs leading-6 text-slate-600"><p className="whitespace-pre-wrap break-words">{value.text}</p><p className="text-slate-500">这是来源整体的 AI 用途与条件原稿，不能直接视为该组件的适用性。条件在当时是否可得仍未知；原稿有 {value.assumptions_count} 项假设、{value.unknowns_count} 项未知，完整内容见报告。</p></div>;
    if (value.kind === 'feedback_assessment') return <div className="space-y-3 text-xs leading-6"><p className="whitespace-pre-wrap break-words text-slate-700">{value.claim}</p><blockquote className="whitespace-pre-wrap break-words border-l-2 border-slate-200 pl-3 text-slate-600">{value.quote}</blockquote><p className="text-slate-500">用户报告：{value.platform || '平台未提供'} · {({backtest: '历史回测', paper: '模拟', live: '实盘报告', configuration: '参数配置', unknown: '类型未知', other: '其他'} as Record<string, string>)[value.mode] || value.mode}。平台真实性未核实，同一反馈中的不同主张不算多个独立样本。</p>
        {!!value.reported_parameters.length && <details><summary className="cursor-pointer text-orange-700">报告中的参数 · {value.reported_parameters.length} 项预览</summary><div className="mt-2 space-y-1">{value.reported_parameters.map((row, index) => <p key={index} className="break-all text-slate-600">{row.name}={row.value} {row.unit}</p>)}</div></details>}
        <p className="text-slate-500">另有 {value.omitted_parameters} 项参数未展开、{value.unknowns_count} 项未知；以原反馈报告为准，未提供的运行参数不以源码默认值补齐。</p></div>;
    return <div className="space-y-3 text-xs leading-6 text-slate-600"><p className="whitespace-pre-wrap break-words">{value.hypothesis}</p><p><span className="text-slate-400">否证条件：</span>{value.falsification}</p><p><span className="text-slate-400">新数据要求：</span>{value.data_requirement}</p>
        <details><summary className="cursor-pointer text-orange-700">原始父代与参数方案 · {value.participants.length} 项</summary><div className="mt-3 space-y-3">{value.participants.map(row => <div key={row.id} className="space-y-2 rounded-lg bg-slate-50 p-3"><p className="font-medium">{row.name}</p><p className="break-all">基线：{JSON.stringify(row.parameters)}</p><p className="break-all">输入：{JSON.stringify(row.bindings)}</p><p className="break-all">待测参数组：{JSON.stringify(row.variants)}</p>{row.id !== current && available.includes(row.id) && <QuantButton onClick={() => focus(row.id)}>以此父代为研究中心</QuantButton>}</div>)}</div></details></div>;
}
export function ResearchRelation({json, current, focus, available}: {json: string; current: string; focus: (id: string) => void; available: string[]}) {
    let value;
    try {value = readGraphResearch(json, current);} catch {return <p role="alert" className="mt-3 text-xs text-amber-700">研究关系记录暂时无法读取，原报告和实验仍保留。</p>;}
    return <div className="mt-3 min-w-0 space-y-3"><p className="text-xs font-semibold text-slate-700">{statusNames[value.status]}</p><Content value={value} current={current} focus={focus} available={available}/>
        <details className="text-xs text-slate-500"><summary className="cursor-pointer">来源时间与版本指纹</summary><p className="mt-2 break-all leading-6">原记录：{value.origin.id}<br/>记录时间：{value.origin.created_at}<br/>原记录指纹：{value.origin.content_hash}<br/>当前公式指纹：{value.candidate_hash}</p></details>
    </div>;
}
