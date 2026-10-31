import {factorName} from '../../utils/quantFactorName';
import {StudyLibrary} from './studies/StudyLibrary';
import {ConnectorPanel} from './connectors/ConnectorPanel';
import {researchStageLabels} from '../../utils/quantAdmission';
import type {AdmissionSummary,ResearchStage} from '../../types/api/quantAdmission';
import {reuseLabels} from '../../utils/quantVerification';
import type {ReuseStatus} from '../../types/api/quantVerification';
import {useQuantVocabulary} from '../../hooks/useQuantVocabulary';
import {VocabularyManager} from './taxonomy/VocabularyManager';
import {vocabularyDimensions} from './taxonomy/presentation';
import {useCallback, useState} from 'react';
import {ArrowLeft, RefreshCw, Search, Sparkles, FlaskConical, GitCompareArrows, Tags, Database, Plug, Cpu, X, Info, RotateCcw} from 'lucide-react';
import {useQuantHybridSearch} from '../../hooks/useQuantHybridSearch';
import {FactorSearchSummary} from './FactorSearchSummary';
import {useQuantFactors} from '../../hooks/useQuantFactors';
import type {QuantFactorCandidate, QuantFactorFamily, QuantFactorRole, QuantFactorGrouping} from '../../types/api/quant';
import {Select} from '../common/Select';
import {QuantBadge, QuantButton, QuantEmpty, cardClass} from './ui';
import {ExperimentLibrary} from './experiments/ExperimentLibrary';
import {DatasetLibrary} from './DatasetLibrary';
import {FactorDetail} from './FactorDetail';
import {FactorEditor} from './FactorEditor';
import {FormulaVersions} from './formulas/FormulaVersions';
import {FactorOccurrences} from './FactorOccurrences';
import type {QuantRegisterDraft} from '../../hooks/useQuantNavigation';
import {factorFamilies, factorRoles} from './factorPresentation';
import {ComparisonLibrary} from './comparisons/ComparisonLibrary';

export function FactorLibrary({initialExperiment, initialComparison, collection, openSource, openGraph, close, register, request}: {initialExperiment?: string; initialComparison?: string; collection: string; openGraph: (candidate: Pick<QuantFactorCandidate,'id'>) => void; openSource: (candidate: Pick<QuantFactorCandidate, 'entryId' | 'reportId'>) => void; close: () => void; register: QuantRegisterDraft; request: (action: () => void) => void}) {
    const [comparisons, setComparisons] = useState(initialComparison !== undefined), [comparisonId, setComparisonId] = useState(initialComparison || '');
    const [comparisonCandidate, setComparisonCandidate] = useState<QuantFactorCandidate>();
    const [datasets, setDatasets] = useState(false);
    const [studies,setStudies]=useState(false),[connectors,setConnectors]=useState(false);
    const [vocabularyOpen, setVocabularyOpen] = useState(false);
    const [taxonomyTerm, setTaxonomyTerm] = useState('');
    const [admissionOverrides,setAdmissionOverrides]=useState<Record<string,{base:QuantFactorCandidate;summary:AdmissionSummary}>>({});
    const [admissionStage,setAdmissionStage]=useState<ResearchStage|''>('');
    const [reuseStatus, setReuseStatus] = useState<ReuseStatus | ''>('reusable');
    const vocabulary = useQuantVocabulary(collection);
    const [experiments, setExperiments] = useState(initialExperiment !== undefined);
    const [experimentId, setExperimentId] = useState(initialExperiment || '');
    const [q, setQuery] = useState('');
    const [role, setRole] = useState<QuantFactorRole | ''>('');
    const [family, setFamily] = useState<QuantFactorFamily | ''>('');
    const [offset, setOffset] = useState(0);
    const [selected, setSelected] = useState('');
    const [groupBy, setGroupBy] = useState<QuantFactorGrouping>('lineage');
    const [editing, setEditing] = useState<QuantFactorCandidate | null>(null);
    const [formulaEditing, setFormulaEditing] = useState<QuantFactorCandidate | null>(null);
    const [sources, setSources] = useState<QuantFactorCandidate | null>(null);
    const [inspection, setInspection] = useState<{key: string; candidate: QuantFactorCandidate} | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const selectionKey = JSON.stringify([q, role, family, taxonomyTerm, reuseStatus, admissionStage, offset, groupBy, selected]);
    const hybrid = useQuantHybridSearch(collection, {q, role, family, taxonomyTerm, reuseStatus, admissionStage, groupBy});
    const keywords = useQuantFactors(collection, {q, role, family, taxonomyTerm, reuseStatus, admissionStage, offset, groupBy, limit: 40}, !hybrid.active);
    const {search: requestSearch} = hybrid;
    const startSearch = useCallback(() => {if (groupBy === 'merged' || groupBy === 'lineage') return; setOffset(0); void requestSearch();}, [requestSearch, groupBy]);
    const sourceController = hybrid.active ? {items: hybrid.data?.items.slice(offset, offset + 40) || [], total: hybrid.data?.total || 0,
        loading: hybrid.loading, error: hybrid.error, reload: startSearch} : keywords;
    const controller={...sourceController,items:sourceController.items.map(row=>admissionOverrides[row.id]?.base===row?{...row,admission:admissionOverrides[row.id].summary}:row)};
    const activeGroup = controller.items.find(row => (row.formulaLineage?.id || row.id) === selected || row.id === selected) || controller.items[0];
    const candidate = (inspection?.key === selectionKey ? inspection.candidate : null) || activeGroup;
    const experimentCandidates = candidate && !controller.items.some(row => row.id === candidate.id) ? [candidate, ...controller.items] : controller.items;
    const {reload: reloadKeywords} = keywords;
    const {cancel: cancelSearch} = hybrid;
    // Editing or returning from another panel refreshes records without another paid query.
    const reload = useCallback(() => {cancelSearch(); setAdmissionOverrides({}); reloadKeywords();}, [cancelSearch, reloadKeywords]);
    const resetFilters = useCallback(() => {
        setQuery('');
        setRole('');
        setFamily('');
        setTaxonomyTerm('');
        setReuseStatus('reusable');
        setGroupBy('lineage');
        setAdmissionStage('');
        setOffset(0);
        cancelSearch();
    }, [cancelSearch]);
    const hasActiveFilters = Boolean(
        q.trim() ||
        role ||
        family ||
        taxonomyTerm ||
        reuseStatus !== 'reusable' ||
        admissionStage ||
        groupBy !== 'lineage'
    );
    const admissionChanged=useCallback((id:string,value:AdmissionSummary)=>{const base=sourceController.items.find(row=>row.id===id);if(base)setAdmissionOverrides(previous=>previous[id]?.base===base&&JSON.stringify(previous[id].summary)===JSON.stringify(value)?previous:{...previous,[id]:{base,summary:value}});if(admissionStage&&value.stage!==admissionStage)reload();},[sourceController.items,admissionStage,reload]);
    const saved = useCallback((updated: QuantFactorCandidate) => {setEditing(null); setInspection({key: selectionKey, candidate: updated}); reload();}, [reload, selectionKey]);
    const vocabularyChanged = useCallback(() => {setInspection(null); vocabulary.reload(); reload();}, [vocabulary, reload]);
    if (studies) return <StudyLibrary collection={collection} candidates={experimentCandidates} initial={candidate?.id} close={()=>{setStudies(false);reload();}} openFactor={id=>openGraph({id})} register={register} request={request}/>;
    if (connectors) return <ConnectorPanel collection={collection} register={register} request={request} close={()=>setConnectors(false)}/>;
    if (comparisons) return <ComparisonLibrary collection={collection} initialCandidate={comparisonCandidate} initialId={comparisonId} register={register} request={request} openSource={openSource} close={() => request(() => {setComparisons(false); reload();})}/>;
    if (experiments) return <ExperimentLibrary openComparison={(id, experimentId) => request(() => {setExperimentId(experimentId); setComparisonId(id); setComparisonCandidate(undefined); setComparisons(true);})} initialExperiment={experimentId} openFactor={(id, name) => request(() => {setExperiments(false); setQuery(name); setRole(''); setFamily(''); setTaxonomyTerm(''); setReuseStatus(''); setAdmissionStage(''); setOffset(0); setSelected(id); setInspection(null); reload();})} openReport={(entryId, reportId) => request(() => openSource({entryId, reportId}))} collection={collection} candidates={experimentCandidates} initial={candidate?.id} close={() => request(() => {setExperiments(false); reload();})} datasets={() => request(() => {setExperiments(false); setDatasets(true);})} register={register} request={request} />;
    if (datasets) return <DatasetLibrary collection={collection} close={() => request(() => setDatasets(false))} register={register} request={request} />;
    return <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-hide sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition-shadow duration-200 sm:p-4 space-y-2.5">
                {/* 顶部主标题栏：左侧精致徽标与说明，右上角独立的【返回研究】与刷新操作 */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/90 pb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-orange-200/70 bg-gradient-to-br from-orange-50 via-amber-50/50 to-orange-100/40 text-orange-600 shadow-2xs">
                            <Cpu size={16} className="stroke-[2.2]" />
                        </div>
                        <div className="min-w-0 flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">因子算法库</h2>
                            <QuantBadge tone="orange" className="!text-[11px] !py-0.2">{controller.total} 项归档</QuantBadge>
                            <span className="hidden xl:inline-block text-xs text-slate-400">· 抽离输入、参数与计算逻辑，统一维护 Python 算法与谱系</span>
                        </div>
                    </div>
                    {/* 右上角：独立的返回研究按钮与刷新 */}
                    <div className="flex shrink-0 items-center gap-2 ml-auto">
                        <QuantButton
                            aria-label="刷新因子库"
                            size="sm"
                            disabled={controller.loading}
                            onClick={controller.reload}
                            className="!p-2 text-slate-500 hover:text-slate-700"
                            title="刷新因子库"
                        >
                            <RefreshCw size={13} className={controller.loading ? 'animate-spin' : ''} />
                        </QuantButton>
                        <button
                            type="button"
                            onClick={close}
                            className="group inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50/80 px-3.5 py-1.5 text-xs font-semibold text-orange-700 shadow-2xs transition hover:border-orange-300 hover:bg-orange-100 hover:text-orange-800 active:scale-[0.98]"
                        >
                            <ArrowLeft size={13} className="stroke-[2.5] transition-transform group-hover:-translate-x-0.5" />
                            <span>返回研究</span>
                        </button>
                    </div>
                </div>

                {/* 第二层：研究工具快捷坞 */}
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-1.5 flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => request(() => setStudies(true))}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-orange-600 active:scale-[0.98]"
                        >
                            <Sparkles size={13} />
                            <span>AI 自动研究</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => request(() => {setExperimentId(''); setExperiments(true);})}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-700 active:scale-[0.98]"
                        >
                            <FlaskConical size={13} className="text-orange-500" />
                            <span>参数与组合实验</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => request(() => {setComparisonCandidate(undefined); setComparisonId(''); setComparisons(true);})}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-700 active:scale-[0.98]"
                        >
                            <GitCompareArrows size={13} className="text-orange-500" />
                            <span>对照与逻辑分组</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => request(() => setDatasets(true))}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-700 active:scale-[0.98]"
                        >
                            <Database size={13} className="text-slate-500" />
                            <span>实验行情</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setVocabularyOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-700 active:scale-[0.98]"
                        >
                            <Tags size={13} className="text-slate-500" />
                            <span>分类词表</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => request(() => setConnectors(true))}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-700 active:scale-[0.98]"
                        >
                            <Plug size={13} className="text-slate-500" />
                            <span>外部研究连接器</span>
                        </button>
                    </div>
                    <span className="hidden lg:inline-block px-2 text-[11px] font-medium text-slate-400">研究工具坞</span>
                </div>

                {/* 第三层：检索与多维筛选 */}
                <div className="space-y-2 pt-0.5">
                    {/* 常用过滤（搜索 + 分组 + 用途 + 分类） */}
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_180px_130px_130px]">
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/60 px-3 transition focus-within:border-orange-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-500/10">
                            <Search size={14} className="shrink-0 text-slate-400" />
                            <input
                                aria-label="搜索因子候选"
                                value={q}
                                onChange={event => {setQuery(event.target.value); setOffset(0);}}
                                maxLength={200}
                                placeholder="搜索因子名称、公式、代码或特征描述..."
                                className="min-w-0 flex-1 bg-transparent py-1.5 text-xs sm:text-sm outline-none placeholder:text-slate-400"
                            />
                            {q && (
                                <button
                                    type="button"
                                    onClick={() => {setQuery(''); setOffset(0);}}
                                    className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                                    title="清空搜索词"
                                >
                                    <X size={12} />
                                </button>
                            )}
                            {hybrid.active ? (
                                <button
                                    type="button"
                                    onClick={hybrid.cancel}
                                    className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700 hover:bg-orange-200 transition"
                                    title="已生效语义检索，点击返回关键词筛选"
                                >
                                    <Sparkles size={11} className="text-orange-600" />
                                    <span>{hybrid.loading ? '正在检索...' : '语义已生效'}</span>
                                    <X size={10} className="ml-0.5" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    disabled={!q.trim() || hybrid.loading || groupBy === 'merged' || groupBy === 'lineage'}
                                    onClick={startSearch}
                                    title={
                                        groupBy === 'lineage'
                                            ? '稳定因子视图匹配任意版本并展示当前研究版；语义扩展请切换相同表达式、原文或全部记录。'
                                            : groupBy === 'merged'
                                            ? '逻辑合并组支持关键词、组名与已保存别名检索；语义扩展请切换相同表达式、原文或全部记录。'
                                            : '点击后结合向量模型做语义相似扩展检索'
                                    }
                                    className="flex shrink-0 items-center gap-1 rounded-lg border border-orange-200/90 bg-orange-50/80 px-2 py-0.5 text-[11px] font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-40 disabled:pointer-events-none transition"
                                >
                                    <Sparkles size={11} />
                                    <span>语义扩展</span>
                                </button>
                            )}
                        </div>
                        <Select
                            aria-label="视图分组方式"
                            value={groupBy}
                            onChange={value => {hybrid.cancel(); setGroupBy(value); setOffset(0);}}
                            buttonClassName="min-h-8.5 py-1.5 text-xs rounded-xl"
                            options={[
                                {value: 'lineage', label: '稳定因子 · 当前研究版'},
                                {value: 'expression', label: '相同表达式'},
                                {value: 'raw', label: '相同原文'},
                                {value: 'merged', label: '主动逻辑合并组'},
                                {value: 'none', label: '全部候选记录'}
                            ]}
                        />
                        <Select
                            aria-label="候选用途"
                            value={role}
                            onChange={value => {setRole(value as QuantFactorRole | ''); setOffset(0);}}
                            buttonClassName="min-h-8.5 py-1.5 text-xs rounded-xl"
                            options={[{value: '', label: '全部用途'}, ...Object.entries(factorRoles).map(([value, label]) => ({value, label}))]}
                        />
                        <Select
                            aria-label="因子分类"
                            value={family}
                            onChange={value => {setFamily(value as QuantFactorFamily | ''); setOffset(0);}}
                            buttonClassName="min-h-8.5 py-1.5 text-xs rounded-xl"
                            options={[{value: '', label: '全部分类'}, ...Object.entries(factorFamilies).map(([value, label]) => ({value, label}))]}
                        />
                    </div>

                    {/* 细化过滤与控制 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                            <div className="w-44">
                                <Select
                                    aria-label="统一分类筛选"
                                    value={taxonomyTerm}
                                    onChange={value => {setTaxonomyTerm(value); setOffset(0);}}
                                    buttonClassName="min-h-8 py-1 text-xs rounded-xl"
                                    options={[
                                        {value: '', label: vocabulary.loading ? '正在加载统一分类…' : '全部统一分类'},
                                        ...(vocabulary.data?.catalog.terms || []).filter(term => term.active || term.id === taxonomyTerm).map(term => ({value: term.id, label: `${vocabularyDimensions[term.dimension]} · ${term.label}`}))
                                    ]}
                                />
                            </div>
                            <div className="w-40">
                                <Select
                                    aria-label="结构可复用状态"
                                    value={reuseStatus}
                                    onChange={value => {setReuseStatus(value as ReuseStatus | ''); setOffset(0);}}
                                    buttonClassName="min-h-8 py-1 text-xs rounded-xl"
                                    options={[
                                        {value: '', label: '全部记录（含旧片段）'},
                                        ...Object.entries(reuseLabels).map(([value, label]) => ({value, label: value === 'reusable' ? '已提取的计算算法' : label}))
                                    ]}
                                />
                            </div>
                            <div className="w-36">
                                <Select
                                    aria-label="研究分层"
                                    value={admissionStage}
                                    onChange={value=>{setAdmissionStage(value as ResearchStage|'');setOffset(0);setInspection(null);}}
                                    buttonClassName="min-h-8 py-1 text-xs rounded-xl"
                                    options={[
                                        {value:'',label:'全部研究分层'},
                                        ...Object.entries(researchStageLabels).map(([value,label])=>({value,label}))
                                    ]}
                                />
                            </div>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-700 transition"
                                    title="恢复默认筛选条件"
                                >
                                    <RotateCcw size={11} />
                                    <span>重置筛选</span>
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowHelp(v => !v)}
                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition ${showHelp ? 'bg-orange-50 text-orange-700 font-medium' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                            >
                                <Info size={12} />
                                <span>{showHelp ? '收起说明' : '检索与谱系说明'}</span>
                            </button>
                            <span className="hidden sm:inline text-slate-200">|</span>
                            <span className="hidden sm:inline">来源与分组展示</span>
                        </div>
                    </div>
                </div>

                {vocabulary.error && <p role="alert" className="mt-2 text-xs text-red-600">{vocabulary.error} <button type="button" className="underline" onClick={vocabulary.reload}>重试</button></p>}

                {hybrid.data && <div className="mt-2.5"><FactorSearchSummary result={hybrid.data}/></div>}

                {showHelp && (
                    <div className="mt-2.5 space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-[11px] leading-relaxed text-slate-500">
                        <p>• {groupBy === 'lineage' ? '稳定因子视图匹配任意版本并展示当前研究版；语义扩展请切换相同表达式、原文或全部记录。' : groupBy === 'merged' ? '逻辑合并组支持关键词、组名与已保存别名检索；语义扩展请切换相同表达式、原文或全部记录。' : '语义扩展检索点击后最多请求一次向量模型；输入时只做关键词筛选。'}</p>
                        <p>• {groupBy === 'lineage' ? '同一因子的公式修订与实验变体保留在版本中；优先展示明确选定的当前研究版，没有选择时展示谱系起点。不按最新时间或最高评分自动切换。' : groupBy === 'merged' ? '按主动合并关系折叠，原候选全部保留；连通分组不推导任意两成员已证等价，撤销桥接关系可拆组。' : '按相同契约折叠展示，保留每次提取、衍生与出处；语义近似和同名候选不会自动合并。'}</p>
                        <p>• 按当前展示版本的最高已记录层筛选，旧版本的达标记录不转移到当前研究版。</p>
                    </div>
                )}
            </section>
            {controller.loading ? <div role="status" className={`${cardClass} text-sm text-slate-500`}>{hybrid.loading ? '正在结合文字与语义检索…' : '正在加载候选库…'}</div> : controller.error ? <div role="alert" className={`${cardClass} space-y-3 text-sm text-red-600`}><p>{controller.error}</p><QuantButton onClick={controller.reload}>重试</QuantButton></div> : !controller.items.length ? <QuantEmpty title={q || role || family || taxonomyTerm || reuseStatus || admissionStage ? '没有匹配的算法' : '算法会随源码分析自动入库'} description="上传源码或重新分析已有来源，提取完整计算算法并入库。未完成转换的模块保留在来源报告中；筛选可查看旧片段记录。" /> : <>
                <div className="flex items-center justify-between gap-4 px-1 pb-0.5 text-xs font-medium text-slate-500">
                    <span>{controller.total} {groupBy === 'none' ? '条候选记录' : '组候选'} · 点击切换查看</span>
                    <span className="font-mono text-[11px] text-slate-400">{offset + 1}–{offset + controller.items.length}</span>
                </div>
                <div className="grid items-start gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
                    <div className="max-h-[50dvh] space-y-2 overflow-auto pr-0.5 scrollbar-hide lg:max-h-[78dvh]" aria-label="候选列表">
                        {controller.items.map(item => {
                            const isActive = activeGroup?.id === item.id;
                            const names = factorName(item.curation.name, item.data.name);
                            const isPython = ['program', 'python'].includes(String(item.data.expression?.op));
                            const roleLabel = factorRoles[item.data.role] || item.data.role || '因子';
                            const familyLabel = factorFamilies[item.curation.family] || item.curation.family || '通用';
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => {setSelected(item.formulaLineage?.id || item.id); setInspection(null);}}
                                    aria-pressed={isActive}
                                    className={`group relative block w-full rounded-xl border p-3.5 text-left transition-all duration-150 ${
                                        isActive
                                            ? 'border-orange-500 bg-orange-50/35 ring-1 ring-orange-500/30 shadow-xs'
                                            : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs'
                                    }`}
                                >
                                    {/* 顶栏：标题 + 分类微标 */}
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className={`truncate text-sm font-semibold transition-colors ${
                                            isActive ? 'text-slate-950 font-bold' : 'text-slate-800 group-hover:text-slate-900'
                                        }`}>
                                            {names.title}
                                        </h3>
                                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                            isActive
                                                ? 'bg-orange-100 text-orange-800 font-semibold'
                                                : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200/70'
                                        }`}>
                                            {familyLabel}
                                        </span>
                                    </div>

                                    {/* 代码标识符 */}
                                    {names.identifier && (
                                        <p className="mt-1 truncate font-mono text-[11px] text-slate-400 group-hover:text-slate-500 transition-colors">
                                            {names.identifier}
                                        </p>
                                    )}

                                    {/* 搜索命中提示 */}
                                    {item.searchMatch && (
                                        <p className="mt-2 truncate rounded-md bg-orange-100/70 px-2 py-1 text-[11px] font-medium text-orange-900">
                                            命中：{[...item.searchMatch.keywordFields, ...(item.searchMatch.semanticSimilarity !== null ? ['语义相关'] : [])].join('、')}
                                        </p>
                                    )}

                                    {/* 底栏元数据 */}
                                    <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`font-medium ${isActive ? 'text-slate-700' : 'text-slate-600'}`}>
                                                {roleLabel}
                                            </span>
                                            <span className="text-slate-200">·</span>
                                            <span className="text-slate-500">
                                                {isPython ? 'Python' : '公式'}
                                            </span>
                                            <span className="text-slate-200">·</span>
                                            <span className="text-slate-500">
                                                {item.data.inputs.length}入 {item.data.parameters.length}参
                                            </span>
                                        </div>
                                        <span className="font-mono text-[10.5px] text-slate-400">
                                            {item.formulaLineage ? `v${item.formulaLineage.versionsTotal}` : 'v1'}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    {candidate && <FactorDetail admissionChanged={admissionChanged} register={register} request={request} openComparison={id => request(() => {setComparisonId(id); setComparisonCandidate(undefined); setComparisons(true);})} collection={collection} versions={() => setFormulaEditing(candidate)} compare={() => request(() => {setComparisonCandidate(candidate); setComparisonId(''); setComparisons(true);})} openExperiment={id => {setExperimentId(id); setExperiments(true);}} candidate={candidate} graph={() => openGraph(candidate)} openSource={openSource} edit={() => setEditing(candidate)} sources={groupBy === 'none' || groupBy === 'lineage' ? undefined : () => setSources(candidate)} />}
                </div>
                {controller.total > 40 && <div className="flex justify-end gap-3"><QuantButton disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 40))}>上一页</QuantButton><QuantButton disabled={offset + controller.items.length >= controller.total} onClick={() => setOffset(value => value + 40)}>下一页</QuantButton></div>}
            </>}
        </div>
        {editing && <FactorEditor collection={collection} candidate={editing} register={register} close={() => request(() => setEditing(null))} saved={saved} />}
        {formulaEditing && <FormulaVersions collection={collection} candidate={formulaEditing} register={register} request={request} close={() => request(() => {setFormulaEditing(null); reload();})} saved={value => {setFormulaEditing(null); saved(value);}}/>}
        {sources && <FactorOccurrences collection={collection} candidate={sources} mode={groupBy} close={() => setSources(null)} inspect={item => {setInspection({key: selectionKey, candidate: item}); setSources(null);}} openSource={openSource} />}
        {vocabularyOpen && <VocabularyManager collection={collection} close={() => request(() => setVocabularyOpen(false))} changed={vocabularyChanged} register={register} request={request}/>}
    </div>;
}
