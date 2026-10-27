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
import {ArrowLeft, RefreshCw, Search} from 'lucide-react';
import {useQuantHybridSearch} from '../../hooks/useQuantHybridSearch';
import {FactorSearchSummary} from './FactorSearchSummary';
import {useQuantFactors} from '../../hooks/useQuantFactors';
import type {QuantFactorCandidate, QuantFactorFamily, QuantFactorRole, QuantFactorGrouping} from '../../types/api/quant';
import {Select} from '../common/Select';
import {QuantButton, QuantEmpty, cardClass} from './ui';
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
    const [reuseStatus, setReuseStatus] = useState<ReuseStatus | ''>('');
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
    const admissionChanged=useCallback((id:string,value:AdmissionSummary)=>{const base=sourceController.items.find(row=>row.id===id);if(base)setAdmissionOverrides(previous=>previous[id]?.base===base&&JSON.stringify(previous[id].summary)===JSON.stringify(value)?previous:{...previous,[id]:{base,summary:value}});if(admissionStage&&value.stage!==admissionStage)reload();},[sourceController.items,admissionStage,reload]);
    const saved = useCallback((updated: QuantFactorCandidate) => {setEditing(null); setInspection({key: selectionKey, candidate: updated}); reload();}, [reload, selectionKey]);
    const vocabularyChanged = useCallback(() => {setInspection(null); vocabulary.reload(); reload();}, [vocabulary, reload]);
    if (studies) return <StudyLibrary collection={collection} candidates={experimentCandidates} initial={candidate?.id} close={()=>{setStudies(false);reload();}} openFactor={id=>openGraph({id})} register={register} request={request}/>;
    if (connectors) return <ConnectorPanel collection={collection} register={register} request={request} close={()=>setConnectors(false)}/>;
    if (comparisons) return <ComparisonLibrary collection={collection} initialCandidate={comparisonCandidate} initialId={comparisonId} register={register} request={request} openSource={openSource} close={() => request(() => {setComparisons(false); reload();})}/>;
    if (experiments) return <ExperimentLibrary openComparison={(id, experimentId) => request(() => {setExperimentId(experimentId); setComparisonId(id); setComparisonCandidate(undefined); setComparisons(true);})} initialExperiment={experimentId} openFactor={(id, name) => request(() => {setExperiments(false); setQuery(name); setRole(''); setFamily(''); setTaxonomyTerm(''); setReuseStatus(''); setAdmissionStage(''); setOffset(0); setSelected(id); setInspection(null); reload();})} openReport={(entryId, reportId) => request(() => openSource({entryId, reportId}))} collection={collection} candidates={experimentCandidates} initial={candidate?.id} close={() => request(() => {setExperiments(false); reload();})} datasets={() => request(() => {setExperiments(false); setDatasets(true);})} register={register} request={request} />;
    if (datasets) return <DatasetLibrary collection={collection} close={() => request(() => setDatasets(false))} register={register} request={request} />;
    return <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-hide sm:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
            <section className={cardClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-900">因子候选库</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">AI 分析提取因子，实验继续积累参数变体和组合公式。每项保留来源、父代和参数，可用于后续研究。</p></div><div className="flex flex-wrap gap-2"><QuantButton primary onClick={()=>request(()=>setStudies(true))}>AI 自动研究</QuantButton><QuantButton onClick={()=>request(()=>setConnectors(true))}>外部研究连接器</QuantButton><QuantButton onClick={() => request(() => {setExperimentId(''); setExperiments(true);})}>参数与组合实验</QuantButton><QuantButton onClick={() => request(() => {setComparisonCandidate(undefined); setComparisonId(''); setComparisons(true);})}>对照与逻辑分组</QuantButton><QuantButton onClick={() => setVocabularyOpen(true)}>分类词表</QuantButton><QuantButton onClick={() => request(() => setDatasets(true))}>实验行情</QuantButton><QuantButton onClick={close}><ArrowLeft size={14} />返回研究</QuantButton><QuantButton aria-label="刷新因子库" disabled={controller.loading} onClick={controller.reload}><RefreshCw size={15} /></QuantButton></div></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_150px]"><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={16} className="shrink-0 text-slate-400" /><input aria-label="搜索因子候选" value={q} onChange={event => {setQuery(event.target.value); setOffset(0);}} maxLength={200} placeholder="名称、公式，或描述想找的信号" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></label>
                    <Select aria-label="候选用途" value={role} onChange={value => {setRole(value as QuantFactorRole | ''); setOffset(0);}} options={[{value: '', label: '全部用途'}, ...Object.entries(factorRoles).map(([value, label]) => ({value, label}))]} />
                    <Select aria-label="因子分类" value={family} onChange={value => {setFamily(value as QuantFactorFamily | ''); setOffset(0);}} options={[{value: '', label: '全部分类'}, ...Object.entries(factorFamilies).map(([value, label]) => ({value, label}))]} /></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2"><Select aria-label="统一分类筛选" value={taxonomyTerm} onChange={value => {setTaxonomyTerm(value); setOffset(0);}} options={[{value: '', label: vocabulary.loading ? '正在加载统一分类…' : '全部统一分类'}, ...(vocabulary.data?.catalog.terms || []).filter(term => term.active || term.id === taxonomyTerm).map(term => ({value: term.id, label: `${vocabularyDimensions[term.dimension]} · ${term.label}`}))]}/><Select aria-label="结构可复用状态" value={reuseStatus} onChange={value => {setReuseStatus(value as ReuseStatus | ''); setOffset(0);}} options={[{value: '', label: '全部结构检查状态'}, ...Object.entries(reuseLabels).map(([value, label]) => ({value, label}))]}/>{vocabulary.error && <p role="alert" className="mt-2 text-xs text-red-600">{vocabulary.error} <button type="button" className="underline" onClick={vocabulary.reload}>重试</button></p>}</div>
                <div className="mt-3 flex flex-wrap items-center gap-3"><QuantButton primary disabled={!q.trim() || hybrid.loading || groupBy === 'merged' || groupBy === 'lineage'} onClick={startSearch}>语义扩展检索</QuantButton>{hybrid.active && <QuantButton onClick={hybrid.cancel}>{hybrid.loading ? '停止等待' : '回到关键词筛选'}</QuantButton>}<span className="text-xs leading-6 text-slate-500">{groupBy === 'lineage' ? '稳定因子视图匹配任意版本并展示当前研究版；语义扩展请切换相同表达式、原文或全部记录。' : groupBy === 'merged' ? '逻辑合并组支持关键词、组名与已保存别名检索；语义扩展请切换相同表达式、原文或全部记录。' : '点击后最多请求一次向量模型；输入时只做关键词筛选。'}</span></div>
                {hybrid.data && <FactorSearchSummary result={hybrid.data}/>}
                <div className="mt-4 flex flex-wrap items-center gap-3"><span className="text-xs text-slate-500">来源与分组展示</span><div className="min-w-48"><Select value={groupBy} onChange={value => {hybrid.cancel(); setGroupBy(value); setOffset(0);}} options={[{value: 'lineage', label: '稳定因子 · 当前研究版'}, {value: 'expression', label: '相同表达式'}, {value: 'raw', label: '相同原文'}, {value: 'merged', label: '主动逻辑合并组'}, {value: 'none', label: '全部候选记录'}]} /></div></div><p className="mt-3 text-xs text-slate-400">{groupBy === 'lineage' ? '同一因子的公式修订与实验变体保留在版本中；优先展示明确选定的当前研究版，没有选择时展示谱系起点。不按最新时间或最高评分自动切换。' : groupBy === 'merged' ? '按主动合并关系折叠，原候选全部保留；连通分组不推导任意两成员已证等价，撤销桥接关系可拆组。' : '按相同契约折叠展示，保留每次提取、衍生与出处；语义近似和同名候选不会自动合并。'}</p>
                <div className="mt-4 max-w-sm"><Select value={admissionStage} onChange={value=>{setAdmissionStage(value as ResearchStage|'');setOffset(0);setInspection(null);}} options={[{value:'',label:'全部研究分层'},...Object.entries(researchStageLabels).map(([value,label])=>({value,label}))]}/><p className="mt-2 text-xs leading-6 text-slate-500">按当前展示版本的最高已记录层筛选，旧版本的达标记录不转移到当前研究版。</p></div>
            </section>
            {controller.loading ? <div role="status" className={`${cardClass} text-sm text-slate-500`}>{hybrid.loading ? '正在结合文字与语义检索…' : '正在加载候选库…'}</div> : controller.error ? <div role="alert" className={`${cardClass} space-y-3 text-sm text-red-600`}><p>{controller.error}</p><QuantButton onClick={controller.reload}>重试</QuantButton></div> : !controller.items.length ? <QuantEmpty title={q || role || family || taxonomyTerm || reuseStatus || admissionStage ? '没有匹配的候选' : '候选会随着研究自动积累'} description="收集资料并生成新版 AI 报告后，可分离的计算、信号与过滤条件会自动入库。旧报告可重新分析以提取候选。" /> : <>
                <div className="flex items-center justify-between gap-4 text-xs text-slate-500"><span>{controller.total} {groupBy === 'none' ? '条候选记录' : '组候选'} · 结构与实证分开展示</span><span>{offset + 1}–{offset + controller.items.length}</span></div>
                <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"><div className="max-h-[45dvh] space-y-2 overflow-auto scrollbar-hide lg:max-h-[70dvh]" aria-label="候选列表">{controller.items.map(item => <button key={item.id} onClick={() => {setSelected(item.formulaLineage?.id || item.id); setInspection(null);}} aria-pressed={activeGroup?.id === item.id} className={`w-full rounded-2xl border p-4 text-left transition ${activeGroup?.id === item.id ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}><div className="mb-2 flex justify-between gap-2 text-xs text-slate-500"><span>{factorRoles[item.data.role]}</span><span>{factorFamilies[item.curation.family]}</span></div><h3 className="break-words text-sm font-semibold text-slate-900">{item.curation.name}</h3><p className="mt-2 line-clamp-2 text-xs leading-6 text-slate-500">{item.data.summary}</p>{item.searchMatch && <p className="mt-2 text-xs leading-6 text-slate-600">命中：{[...item.searchMatch.keywordFields, ...(item.searchMatch.semanticSimilarity !== null ? ['语义相关'] : [])].join('、')}</p>}<p className="mt-2 text-xs text-slate-600">{item.admission?researchStageLabels[item.admission.stage]:'分层待归集'}{item.admission?.reviewCount?` · ${item.admission.reviewCount}条需复核`:''}</p><p className="mt-3 truncate text-[11px] text-slate-400">{item.formulaLineage ? `研究版 · ${item.formulaLineage.versionsTotal} 个版本 · ` : item.data.formulaVersion ? '公式修订 · ' : item.data.derivation ? '实验衍生 · ' : '来源 · '}{item.entryTitle}{item.occurrenceCount > 1 ? ` · 共 ${item.occurrenceCount} 条记录` : ''}</p></button>)}</div>
                    {candidate && <FactorDetail admissionChanged={admissionChanged} register={register} request={request} openComparison={id => request(() => {setComparisonId(id); setComparisonCandidate(undefined); setComparisons(true);})} collection={collection} versions={() => setFormulaEditing(candidate)} compare={() => request(() => {setComparisonCandidate(candidate); setComparisonId(''); setComparisons(true);})} openExperiment={id => {setExperimentId(id); setExperiments(true);}} candidate={candidate} graph={() => openGraph(candidate)} openSource={openSource} edit={() => setEditing(candidate)} sources={groupBy === 'none' || groupBy === 'lineage' ? undefined : () => setSources(candidate)} />}</div>
                {controller.total > 40 && <div className="flex justify-end gap-3"><QuantButton disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 40))}>上一页</QuantButton><QuantButton disabled={offset + controller.items.length >= controller.total} onClick={() => setOffset(value => value + 40)}>下一页</QuantButton></div>}
            </>}
        </div>
        {editing && <FactorEditor collection={collection} candidate={editing} register={register} close={() => request(() => setEditing(null))} saved={saved} />}
        {formulaEditing && <FormulaVersions collection={collection} candidate={formulaEditing} register={register} request={request} close={() => request(() => {setFormulaEditing(null); reload();})} saved={value => {setFormulaEditing(null); saved(value);}}/>}
        {sources && <FactorOccurrences collection={collection} candidate={sources} mode={groupBy} close={() => setSources(null)} inspect={item => {setInspection({key: selectionKey, candidate: item}); setSources(null);}} openSource={openSource} />}
        {vocabularyOpen && <VocabularyManager collection={collection} close={() => request(() => setVocabularyOpen(false))} changed={vocabularyChanged} register={register} request={request}/>}
    </div>;
}
