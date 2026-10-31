import {factorName} from '../../utils/quantFactorName';
import {AlgorithmDefinition} from './AlgorithmDefinition';
import { useQuantCopyFeedback } from '../../hooks/useQuantCopyFeedback';
import {ParameterSource} from './ParameterSource';
import {parameterLabel} from '../../utils/quantParameterSource';
import type {AdmissionSummary} from '../../types/api/quantAdmission';
import {FactorAdmission} from './admissions/FactorAdmission';
import type {QuantRegisterDraft} from '../../hooks/useQuantNavigation';
import {FactorVerification} from './verification/FactorVerification';
import {NativePanel} from './nativePython/NativePanel';
import {Classification} from './taxonomy/Classification';
import {ExternalLink, Copy, Check, Network, GitBranch, GitCompareArrows, Edit3, Download} from 'lucide-react';
import {useState} from 'react';
import {FactorExport} from './FactorExport';
import {ParameterDomain} from './ParameterDomain';
import type {QuantFactorCandidate} from '../../types/api/quant';
import {quantDate} from '../../utils/quant';
import {QuantBadge, QuantButton, cardClass} from './ui';
import {factorFamilies, factorOutputs, factorRoles} from './factorPresentation';

export function FactorDetail({collection, candidate, openSource, register, request, edit, versions, sources, graph, openExperiment, compare, openComparison,admissionChanged}: {admissionChanged?:(candidate:string,value:AdmissionSummary)=>void;collection: string; candidate: QuantFactorCandidate; openSource: (candidate: Pick<QuantFactorCandidate,'entryId'|'reportId'>) => void; register:QuantRegisterDraft;request:(action:()=>void)=>void; edit: () => void; versions: () => void; sources?: () => void; graph: () => void; openExperiment: (id: string) => void; compare?: () => void; openComparison?: (id: string) => void}) {
    const [exporting, setExporting] = useState(false);
    const { copiedKey, error: copyError, copy } = useQuantCopyFeedback();
    const copiedFormula = copiedKey === 'copy';
    const data = candidate.data;
    const curated = candidate.curation;
    const derived = data.derivation;
    const authored = data.formulaVersion;
    return <section className={`${cardClass} min-w-0 space-y-6`} aria-label="候选详情">
        <div className="border-b border-slate-100 pb-4">
            <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <QuantBadge tone="orange">{factorRoles[data.role]}</QuantBadge>
                <QuantBadge tone="slate">{factorFamilies[curated.family]}</QuantBadge>
                <QuantBadge tone={candidate.verification?.reuseStatus === 'reusable' ? 'emerald' : 'amber'}>
                    {['program', 'python'].includes(String(data.expression?.op)) ? 'Python算法' : data.expression ? '公式算法' : '旧来源片段'}
                </QuantBadge>
            </div>
            <h3 className="break-words text-xl font-extrabold tracking-tight text-slate-900">{factorName(curated.name, data.name).title}</h3>
            {factorName(curated.name, data.name).identifier && <p className="mt-1.5 break-all font-mono text-xs text-slate-500">{factorName(curated.name, data.name).identifier}</p>}
            <p className="mt-2.5 whitespace-pre-wrap text-sm leading-7 text-slate-600">{data.summary}</p>
            {curated.note && <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-600">{curated.note}</p>}
        </div>
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2.5">
            <QuantButton size="sm" onClick={graph}><Network size={14} className="text-orange-500" />查看关系图谱</QuantButton>
            <QuantButton size="sm" onClick={versions}><GitBranch size={14} className="text-orange-500" />公式版本与当前研究版</QuantButton>
            {compare && <QuantButton size="sm" onClick={compare}><GitCompareArrows size={14} className="text-orange-500" />对照与等价证据</QuantButton>}
            <QuantButton size="sm" onClick={edit}><Edit3 size={14} className="text-slate-500" />整理名称与标签</QuantButton>
            {sources && <QuantButton size="sm" onClick={sources}>查看同组来源</QuantButton>}
            <QuantButton size="sm" disabled={!data.expression} onClick={() => setExporting(true)}><Download size={14} />导出计算代码</QuantButton>
        </div>
        <AlgorithmDefinition candidate={candidate}/>
        <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">实验与历史研究记录</summary><div className="mt-4 space-y-5">
        <FactorVerification key={candidate.id} collection={collection} candidate={candidate.id} definition={data} openSource={() => openSource(candidate)} openExperiment={openExperiment} openComparison={openComparison} openVersions={versions}/>
        <FactorAdmission key={`admission-${candidate.id}`} collection={collection} candidate={candidate.id} initial={candidate.admission} changed={value=>admissionChanged?.(candidate.id,value)}/>
        </div></details>
        <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800">完整定义、输入参数与来源</summary><div className="mt-5 space-y-6">
        <NativePanel key={`native-${candidate.id}`} collection={collection} candidate={candidate} register={register} request={request} openSource={(entryId,reportId)=>openSource({entryId:entryId||candidate.entryId,reportId:reportId||candidate.reportId})}/>
        <Classification value={candidate.classification}/>
        {authored && <p className="rounded-xl border border-orange-200/70 bg-orange-50/70 p-4 text-sm leading-7 text-slate-700">{authored.origin === 'ai_study' ? '这是一份AI自动研究产生的候选，研究评价与实证表现分开，尚无实验验证。' : authored.origin === 'ai_repair' ? '这是一份独立 AI 定义修订假设，原平台等价与实证尚未验证。' : '这是一份独立人工公式修订，尚未进行实证评价。'}原报告与源码提供祖先上下文，其评分、原始参数与引文不属于这份新公式；可在公式版本中查看完整定义、父代和工作版本选择。</p>}
        {(curated.aliases.length > 0 || curated.note) && <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-4 text-sm leading-7 text-slate-600">{curated.aliases.length > 0 && <p>别名：{curated.aliases.join('、')}</p>}{curated.note && <p className="whitespace-pre-wrap">{curated.note}</p>}</div>}
        {candidate.curationRevisionId && <p className="text-xs text-slate-400">{candidate.curationInherited ? '沿用同一算法的历史整理' : '已人工整理'} · 原始名称：{data.name} · 本记录 {candidate.revisions.length} 次修订</p>}
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
            <div className="mb-2.5 flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900">公式与输出</h4>
                <button
                    type="button"
                    onClick={() => {
                        void copy(data.formula);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-orange-200 hover:text-orange-600"
                >
                    {copiedFormula ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    {copiedFormula ? '已复制公式' : '复制公式'}
                </button>
            </div>
            {copyError && <p role="alert" className="mb-2 text-xs text-red-600">{copyError}</p>}
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200/80 bg-white p-4 font-mono text-sm leading-7 text-slate-800 shadow-2xs scrollbar-hide">{data.formula}</pre>
            <p className="mt-2.5 text-xs leading-6 text-slate-500">{factorOutputs[data.outputType]} · 单位：{data.units}<br />窗口与周期：{data.timeframe}</p>
        </div>
        <div>
            <h4 className="mb-3 text-sm font-bold text-slate-900">输入与数据时点</h4>
            <div className="grid gap-3 sm:grid-cols-2">
                {data.inputs.map(input => (
                    <div key={input.name} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-sm leading-6">
                        <strong className="break-all rounded-md bg-white px-2 py-0.5 font-mono text-xs font-bold text-orange-700 shadow-2xs">{input.name}</strong>
                        <span className="ml-2 font-medium text-slate-800">{input.meaning}</span>
                        <p className="mt-2 text-xs text-slate-500">可得时点：{input.availability}<br />缺失处理：{input.missingPolicy}</p>
                    </div>
                ))}
            </div>
        </div>
        <div><h4 className="mb-3 text-sm font-bold text-slate-900">参数与候选建议</h4>{data.parameters.length ? data.parameters.map(parameter => <div key={parameter.name} className="mb-3 rounded-xl border border-slate-200/90 bg-white p-4 text-sm leading-7 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="break-all rounded-lg bg-orange-50 px-2.5 py-0.5 font-mono text-xs font-bold text-orange-700">{parameterLabel(parameter)}</strong>
                <span className="rounded-md bg-slate-100 px-2.5 py-0.5 font-mono text-xs text-slate-700">{authored ? '修订声明' : derived ? '归档实验值' : '默认'}：{parameter.defaultValue || '未知'}</span>
            </div>
            <p className="mt-2 font-medium text-slate-800">{parameter.meaning}</p>
            <p className="mt-1.5 text-xs leading-6 text-slate-500">约束：{parameter.constraints}<br />影响：{parameter.effect}<br />建议（待验证）：{parameter.suggestion}<br />依据：{parameter.evidence}</p>
            <ParameterSource parameter={parameter}/><ParameterDomain name={parameter.name} domain={parameter.domain} authored={!!authored}/>
        </div>) : <p className="text-sm text-slate-500">未识别到可独立调整的参数。</p>}</div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4"><h4 className="mb-2 text-sm font-bold text-slate-900">依赖与限制</h4><p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{data.dependencies.join('；') || '未声明外部依赖'}<br />{data.limitations}</p>
            <p className="mt-2 text-xs leading-6 text-slate-500">{derived?.localDemo ? '本地展示样例；未执行行情计算或验证。' : derived ? '已在本机表达式引擎计算；原平台等价性和独立样本表现仍待验证。' : data.expression ? '已保存受控表达式；能否运行以本版本结构检查和实际配置为准。' : '保留原平台公式，尚无可用的通用表达式。'}</p></div>
        <div className="border-t border-slate-100 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-bold text-slate-900">{derived ? '生成依据与父代' : '提取出处'}</h4><QuantButton onClick={() => openSource(candidate)}><ExternalLink size={14} />{derived || authored ? '查看祖先来源报告' : '打开来源报告'}</QuantButton></div>
            <p className="mt-3 text-xs leading-6 text-slate-500">{candidate.entryTitle}<br />{candidate.modelName || 'AI 分析'} · {quantDate(candidate.createdAt)}</p>
            {derived && <div className="mt-3 space-y-3 rounded-xl bg-orange-50 p-4 text-xs leading-7 text-slate-600"><p>由 {derived.parentCandidateIds.length} 个父代产生 · {derived.attemptId}<br/>{derived.localDemo ? '本地样例仅演示回库谱系，没有进行真实计算。' : '按训练与验证段筛选归档，留出收益不参与回库选择；生成公式不属于原文摘录。'}</p><QuantButton onClick={() => openExperiment(derived.requestId)}>查看生成实验与实际参数</QuantButton><details><summary>父代与实验版本</summary><p className="mt-2 break-all">父代候选：{derived.parentCandidateIds.join('、')}<br/>父代尝试：{derived.parentAttemptIds.join('、')}<br/>引擎：{derived.engineVersion}</p></details></div>}
            {data.evidence.map((item, index) => <blockquote key={index} className="mt-3 rounded-r-xl border-l-3 border-orange-300 bg-slate-50/80 py-2.5 pr-3 pl-4"><span className="text-xs font-semibold text-slate-500">{item.field === 'code' ? '源码原文' : item.field === 'description' ? '提交说明原文' : '网页快照原文'}</span><pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-600 scrollbar-hide">{item.quote}</pre></blockquote>)}
            <details className="mt-4 text-xs text-slate-400"><summary className="cursor-pointer hover:text-slate-600">版本与结构指纹</summary><p className="mt-2 break-all leading-6">报告：{candidate.reportId}<br />来源快照：{candidate.sourceId}<br />结构指纹：{candidate.expressionHash || '无通用表达式'}<br />相同指纹仅代表表达式及输入契约一致，不代表实证等价。</p></details></div>
        </div></details>
        {exporting && <FactorExport collection={collection} candidate={candidate} close={() => setExporting(false)}/>}
    </section>;
}
