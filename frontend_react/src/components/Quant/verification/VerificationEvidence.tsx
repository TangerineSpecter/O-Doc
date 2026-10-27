import {StrategySummary, StrategyLedger} from '../experiments/StrategyResults';
import {readStrategy} from '../../../utils/quantStrategy';
import {readStrategyExecution} from '../../../utils/quantStrategyExecution';
import type {DirectVerification, VerificationMetrics} from '../../../types/api/quantVerification';
import {feedbackModes} from '../../../types/api/quantFeedback';
import {quantDate} from '../../../utils/quant';
import {QuantButton} from '../ui';
import {RegisteredCriteriaResult} from '../validations/RegisteredCriteriaResult';
import {nativeReasonLabels,nativeVerdictLabels} from '../../../utils/quantNativePython';
const percent = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '未提供';
const status: Record<string, string> = {evaluated: '已计算', rejected: '未通过', cancelled: '已停止', budget_stopped: '预算停止', completed: '已完成', partial: '部分完成', failed: '失败'};
function Metrics({value}: {value?: VerificationMetrics}) {
    return <span>净收益 {percent(value?.total_return)} · 回撤 {percent(value?.max_drawdown)} · {value?.execution && <span>执行损益 {percent(value.execution.realized_pnl)}，资金缺口 {String(value.execution.capital_deficit)} · </span>}{value?.bars ?? '未知'} 段</span>;
}
export function VerificationEvidence({value, createdAt, openExperiment, openComparison}: {value: DirectVerification; createdAt: string; openExperiment: (id: string) => void; openComparison?: (id: string) => void}) {
    return <article className="space-y-3 rounded-xl border border-slate-200 p-4 text-xs leading-6 text-slate-600">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm font-semibold text-slate-800">{value.kind==='native_python'?'原始Python函数验证':value.kind === 'experiment' ? '本机受控实验' : value.kind === 'fixed_validation' ? '登记后的固定验证' : value.kind === 'comparison' ? '固定样本对照' : '用户提供的观察'}</strong><span className="text-slate-400">{quantDate(createdAt)}</span></div>
        {value.local_demo && <p className="rounded-lg bg-orange-50 p-3">人工构造的本地展示样例，未计算导入行情、未调用模型或验证平台。</p>}
        {value.kind==='native_python'?<>
            <p className="font-medium">原始Python函数 · {value.verdict?nativeVerdictLabels[value.verdict]:nativeReasonLabels[value.reason]||value.reason||value.status}</p>
            <p>{value.dataset.start} → {value.dataset.end} · 偏移{value.dataset.offset} · {value.dataset.row_count}行 · 函数{value.native.entrypoint}</p>
            <p className="break-words">候选表达式实际参数：{Object.entries(value.parameters).map(([key,item])=>`${key}=${JSON.stringify(item)}`).join('，')||'无可调参数'}</p>
            {value.comparison&&<p>共同有效{value.comparison.counts.common_valid}行 · 数值差异{value.comparison.counts.value_mismatches}行 · 缺失差异{value.comparison.counts.missing_mismatches}行。</p>}
            <p>Python {value.environment.runtime.python} · pandas {value.environment.runtime.pandas}。完整映射、运行环境、反例和AI解读在因子详情的原始Python验证区查看；本次观察不代表收益或平台全局等价。</p>
        </>:value.kind === 'fixed_validation' ? <>
            <p>{value.market.symbol} · {value.market.timeframe} · {value.mode === 'fresh' ? '登记后导入的新数据验证' : '普通复核'}。单侧费用 {value.config.fee_bps} bps，滑点 {value.config.slippage_bps} bps。</p>
            <p className="break-words">{value.bounds.start_timestamp} → {value.bounds.end_timestamp} · 来源尝试 {value.source_attempt_id}</p>
            <p className="break-all font-mono">{Object.entries(value.recipe.parameters).map(([k,v]) => `${k}=${v}`).join('，') || '无可调参数'}</p>
            {value.result_status&&value.result_status!=='completed'&&<p className="text-orange-700">{value.result_status==='cancelled'?'评价已停止':'评价未完成'}：{value.error}；以下范围为冻结计划，未形成实际指标。</p>}
            <p>固定方案：<Metrics value={value.metrics}/></p><p>同成本基线：<Metrics value={value.baseline}/></p>
            {value.registered_criteria && <RegisteredCriteriaResult criteria={value.registered_criteria} assessment={value.criteria_assessment}/>}
            {value.publication_audit?<p>发布时发现 {value.publication_audit.conflict_count} 条重叠，扫描{value.publication_audit.complete_scan ? '覆盖已记录范围' : '不完整'}；外部使用及全局独立性未知。当前重用审计和完整报告见来源实验的固定验证区。</p>:<p>尚未形成发布时审计，不能将未知记作零重叠。</p>}
            <QuantButton onClick={() => openExperiment(value.source_request_id)}>打开来源实验与固定验证</QuantButton>
        </> : value.kind === 'experiment' ? <>
            <p>{value.market.symbol || '标的未知'} · {value.market.timeframe || '周期未知'} · {status[value.result_status] || value.result_status}。费用 {value.config.fee_bps} bps，滑点 {value.config.slippage_bps} bps，隔离 {value.config.gap} 根。</p>
            {value.config.strategy && <StrategySummary policy={readStrategy(value.config.strategy, value.config.threshold)} threshold={value.config.threshold}/>}
            {value.heldout.map((row, index) => row.metrics.execution && <StrategyLedger key={index} execution={readStrategyExecution(row.metrics.execution, row.metrics.entries || 0, false)} label={row.number ? `第${row.number}折留出` : '本批留出'}/>)}
            {value.error && <p className="text-red-600">{value.error}</p>}
            {!value.attempts.length && value.checkpoint_count > 0 && <p>尚无正式输出；已保存 {value.checkpoint_count} 个尝试检查点，可在完整实验中查看。此记录不推定计算成功。</p>}
            {!!value.overlap_audit?.total && <p className="rounded-lg bg-orange-50 p-3">同文集、同标的与周期已有 {value.overlap_audit.total} 次实验请求区间重叠；当前留出观察不能据此当作新数据的独立验证。</p>}
            <details><summary className="cursor-pointer">当前版本的 {value.attempts.length} 次直接尝试（保留失败及反例）</summary><div className="mt-3 max-h-80 space-y-3 overflow-auto scrollbar-hide">{value.attempts.map(attempt => <div key={attempt.id} className="rounded-lg bg-slate-50 p-3"><p className="font-medium">{attempt.id} · {status[attempt.status] || attempt.status}{attempt.fold ? ` · 第 ${attempt.fold} 折` : ''}</p><p>实际参数：{attempt.parameters.map(row => `${row.original_name}=${JSON.stringify(row.value)}`).join('，') || '无参数'}</p><p>输入：{attempt.bindings.map(row => `${row.name} → ${row.column}`).join('，') || '未形成输入绑定'}</p>{attempt.reason && <p className="text-orange-700">{attempt.reason}</p>}{attempt.metrics.train && <p>训练 · <Metrics value={attempt.metrics.train}/></p>}{attempt.metrics.validation && <p>验证 · <Metrics value={attempt.metrics.validation}/></p>}</div>)}</div></details>
            {value.heldout.length > 0 && <div className="rounded-lg bg-slate-50 p-3"><p>以下留出观察属于本版本的实际入选尝试；既往是否使用过这些数据仍未证实。</p>{value.heldout.map((row, index) => <p key={index}>{row.number ? `第 ${row.number} 折` : '本批留出'} · {row.attempt_id} · <Metrics value={row.metrics}/></p>)}</div>}
            <QuantButton onClick={() => openExperiment(value.request_id)}>查看完整实验、数据与参数</QuantButton>
        </> : value.kind === 'comparison' ? <>
            <p>{value.market.symbol || '标的未知'} · {value.market.timeframe || '周期未知'} · {value.verdict === 'pass' ? '当前样本口径通过' : value.verdict === 'fail' ? '发现直接反例' : '证据不足或未完成'}。共同有效输出 {value.counts.common_valid ?? '未知'} 行，数值差异 {value.counts.value_mismatches ?? '未知'} 行。</p>
            <p>绝对容差 {value.policy.absolute_tolerance}，相对容差 {value.policy.relative_tolerance}，共同预热 {value.policy.warmup_bars} 根。结论仅限本次参数、行情和对齐规则。</p>
            {value.sides.map(side => <p key={side.side}>本版本在{side.side === 'left' ? '左侧' : '右侧'}：{side.parameters.map(row => `${row.name}=${JSON.stringify(row.value)}`).join('，') || '无参数'}；输入 {side.bindings.map(row => `${row.name} → ${row.column}`).join('，')}。</p>)}
            {openComparison && <QuantButton onClick={() => openComparison(value.target_id)}>查看直接对照</QuantButton>}
        </> : <>
            <p className="font-medium">{value.title}</p><p>{feedbackModes[value.mode as keyof typeof feedbackModes] || '未说明观察类型'} · {value.platform || '平台未说明'}</p>
            <p>{value.structured ? `已结构化读取；上传记录算术核对：${{reconciled: '在已给口径内一致', mismatch: '存在差异', insufficient: '资料不足'}[value.accounting_status] || value.accounting_status}。` : '原始文本或配置记录，尚未形成可复现执行证据。'} 平台来源及实盘真实性尚未验证，用户声明不能替代程序验证。</p>
            <p className="text-slate-400">可在该研究的“使用反馈”查看原件与 AI 分析。</p>
        </>}
        <details className="text-slate-400"><summary className="cursor-pointer">对象版本与证据指纹</summary><p className="mt-2 break-all">对象：{value.target_id}<br/>公式：{value.candidate_hash}<br/>记录：{value.target_hash}<br/>范围：{value.scope}</p></details>
    </article>;
}
