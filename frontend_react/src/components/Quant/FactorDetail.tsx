import {ParameterSource} from './ParameterSource';
import {parameterLabel} from '../../utils/quantParameterSource';
import type {AdmissionSummary} from '../../types/api/quantAdmission';
import {FactorAdmission} from './admissions/FactorAdmission';
import type {QuantRegisterDraft} from '../../hooks/useQuantNavigation';
import {FactorVerification} from './verification/FactorVerification';
import {NativePanel} from './nativePython/NativePanel';
import {reuseLabels} from '../../utils/quantVerification';
import {Classification} from './taxonomy/Classification';
import {ExternalLink} from 'lucide-react';
import {useState} from 'react';
import {FactorExport} from './FactorExport';
import {ParameterDomain} from './ParameterDomain';
import type {QuantFactorCandidate} from '../../types/api/quant';
import {quantDate} from '../../utils/quant';
import {QuantButton, cardClass} from './ui';
import {factorFamilies, factorOutputs, factorRoles} from './factorPresentation';

export function FactorDetail({collection, candidate, openSource, register, request, edit, versions, sources, graph, openExperiment, compare, openComparison,admissionChanged}: {admissionChanged?:(candidate:string,value:AdmissionSummary)=>void;collection: string; candidate: QuantFactorCandidate; openSource: (candidate: Pick<QuantFactorCandidate,'entryId'|'reportId'>) => void; register:QuantRegisterDraft;request:(action:()=>void)=>void; edit: () => void; versions: () => void; sources?: () => void; graph: () => void; openExperiment: (id: string) => void; compare?: () => void; openComparison?: (id: string) => void}) {
    const [exporting, setExporting] = useState(false);
    const data = candidate.data;
    const curated = candidate.curation;
    const derived = data.derivation;
    const authored = data.formulaVersion;
    return <section className={`${cardClass} min-w-0 space-y-6`} aria-label="候选详情">
        <div><div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500"><span>{factorRoles[data.role]}</span><span>·</span><span>{factorFamilies[curated.family]}</span><span>· {candidate.verification ? reuseLabels[candidate.verification.reuseStatus] : '验证状态待归集'}</span></div>
            <h3 className="text-lg font-semibold text-slate-900">{curated.name}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{data.summary}</p>
        </div>
        <FactorAdmission key={`admission-${candidate.id}`} collection={collection} candidate={candidate.id} initial={candidate.admission} changed={value=>admissionChanged?.(candidate.id,value)}/>
        <FactorVerification key={candidate.id} collection={collection} candidate={candidate.id} openExperiment={openExperiment} openComparison={openComparison} openVersions={versions}/>
        <NativePanel key={`native-${candidate.id}`} collection={collection} candidate={candidate} register={register} request={request} openSource={(entryId,reportId)=>openSource({entryId:entryId||candidate.entryId,reportId:reportId||candidate.reportId})}/>
        <Classification value={candidate.classification}/>
        <div className="flex flex-wrap gap-2"><QuantButton onClick={graph}>查看关系图谱</QuantButton><QuantButton onClick={versions}>公式版本与当前研究版</QuantButton>{compare && <QuantButton onClick={compare}>对照与等价证据</QuantButton>}<QuantButton onClick={edit}>整理名称与标签</QuantButton>{sources && <QuantButton onClick={sources}>查看同组来源</QuantButton>}<QuantButton disabled={!data.expression} onClick={() => setExporting(true)}>导出候选指标</QuantButton></div>
        {authored && <p className="rounded-xl bg-orange-50 p-4 text-sm leading-7 text-slate-600">{authored.origin === 'ai_repair' ? '这是一份独立 AI 定义修订假设，原平台等价与实证尚未验证。' : '这是一份独立人工公式修订，尚未进行实证评价。'}原报告与源码提供祖先上下文，其评分、原始参数与引文不属于这份新公式；可在公式版本中查看完整定义、父代和工作版本选择。</p>}
        {(curated.aliases.length > 0 || curated.note) && <div className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">{curated.aliases.length > 0 && <p>别名：{curated.aliases.join('、')}</p>}{curated.note && <p className="whitespace-pre-wrap">{curated.note}</p>}</div>}
        {candidate.currentRevisionId && <p className="text-xs text-slate-400">已人工整理 · 原始名称：{data.name} · {candidate.revisions.length} 次修订</p>}
        <div><h4 className="mb-2 text-sm font-semibold">公式与输出</h4><pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-7 scrollbar-hide">{data.formula}</pre>
            <p className="mt-2 text-xs leading-6 text-slate-500">{factorOutputs[data.outputType]} · 单位：{data.units}<br />窗口与周期：{data.timeframe}</p></div>
        <div><h4 className="mb-2 text-sm font-semibold">输入与数据时点</h4><div className="divide-y divide-slate-100">{data.inputs.map(input => <div key={input.name} className="py-3 text-sm leading-6"><strong className="break-all font-mono font-medium">{input.name}</strong> · {input.meaning}<p className="text-slate-500">可得时点：{input.availability}<br />缺失处理：{input.missingPolicy}</p></div>)}</div></div>
        <div><h4 className="mb-2 text-sm font-semibold">参数与候选建议</h4>{data.parameters.length ? data.parameters.map(parameter => <div key={parameter.name} className="mb-3 rounded-xl border border-slate-200 p-4 text-sm leading-7">
            <strong className="break-all font-mono font-medium">{parameterLabel(parameter)}</strong><span className="ml-2 text-slate-500">{authored ? '修订声明' : derived ? '归档实验值' : '默认'}：{parameter.defaultValue || '未知'}</span>
            <p>{parameter.meaning}</p><p className="text-slate-500">约束：{parameter.constraints}<br />影响：{parameter.effect}<br />建议（待验证）：{parameter.suggestion}<br />依据：{parameter.evidence}</p>
            <ParameterSource parameter={parameter}/><ParameterDomain name={parameter.name} domain={parameter.domain} authored={!!authored}/>
        </div>) : <p className="text-sm text-slate-500">未识别到可独立调整的参数。</p>}</div>
        <div><h4 className="mb-2 text-sm font-semibold">依赖与限制</h4><p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{data.dependencies.join('；') || '未声明外部依赖'}<br />{data.limitations}</p>
            <p className="mt-2 text-xs leading-6 text-slate-500">{derived?.localDemo ? '本地展示样例；未执行行情计算或验证。' : derived ? '已在本机表达式引擎计算；原平台等价性和独立样本表现仍待验证。' : data.expression ? '表达式结构已通过校验；原平台等价性仍待验证，实验记录请在实验室查看。' : '保留原平台公式，尚无可用的通用表达式。'}</p></div>
        <div className="border-t border-slate-100 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-semibold">{derived ? '生成依据与父代' : '提取出处'}</h4><QuantButton onClick={() => openSource(candidate)}><ExternalLink size={14} />{derived || authored ? '查看祖先来源报告' : '打开来源报告'}</QuantButton></div>
            <p className="mt-3 text-xs leading-6 text-slate-500">{candidate.entryTitle}<br />{candidate.modelName || 'AI 分析'} · {quantDate(candidate.createdAt)}</p>
            {derived && <div className="mt-3 space-y-3 rounded-xl bg-orange-50 p-4 text-xs leading-7 text-slate-600"><p>由 {derived.parentCandidateIds.length} 个父代产生 · {derived.attemptId}<br/>{derived.localDemo ? '本地样例仅演示回库谱系，没有进行真实计算。' : '按训练与验证段筛选归档，留出收益不参与回库选择；生成公式不属于原文摘录。'}</p><QuantButton onClick={() => openExperiment(derived.requestId)}>查看生成实验与实际参数</QuantButton><details><summary>父代与实验版本</summary><p className="mt-2 break-all">父代候选：{derived.parentCandidateIds.join('、')}<br/>父代尝试：{derived.parentAttemptIds.join('、')}<br/>引擎：{derived.engineVersion}</p></details></div>}
            {data.evidence.map((item, index) => <blockquote key={index} className="mt-3 border-l-2 border-orange-200 pl-4"><span className="text-xs text-slate-400">{item.field === 'code' ? '源码原文' : item.field === 'description' ? '提交说明原文' : '网页快照原文'}</span><pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-600 scrollbar-hide">{item.quote}</pre></blockquote>)}
            <details className="mt-4 text-xs text-slate-400"><summary className="cursor-pointer">版本与结构指纹</summary><p className="mt-2 break-all leading-6">报告：{candidate.reportId}<br />来源快照：{candidate.sourceId}<br />结构指纹：{candidate.expressionHash || '无通用表达式'}<br />相同指纹仅代表表达式及输入契约一致，不代表实证等价。</p></details></div>
        {exporting && <FactorExport collection={collection} candidate={candidate} close={() => setExporting(false)}/>}
    </section>;
}
