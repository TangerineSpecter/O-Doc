import {AgentPostMarkdown} from '@/components/AgentPost/AgentPostMarkdown';
import {postDisplayTitle} from '@/components/AgentPost/postPresentation';
import {publishMaterialTime} from './publishMaterialTime';
import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {Select} from '@/components/common/Select';
import {useEscapeDismissal} from '@/hooks/useEscapeDismissal';
import type {AgentConfig, AgentTaskConfig} from '@/types/api/setting';
import {getLifeConfig} from '@/api/agentLife';
import {usePublicationPreview} from './usePublicationPreview';
interface Props {task: AgentTaskConfig; agents: AgentConfig[]; onClose: () => void}
export function PostPublishPreviewModal({task, agents, onClose}: Props) {
    const [bound, setBound] = useState<AgentConfig[]>([]);
    const [agentId, setAgentId] = useState('');
    const [configError, setConfigError] = useState('');
    useEffect(() => {const c = new AbortController(); getLifeConfig(c.signal).then(config => {if (!c.signal.aborted) {const eligible = agents.filter(a => (config.activeAgentIds || config.settings.agentIds).includes(a.id) && !config.pausedAgents.includes(a.id)); setBound(eligible); setAgentId(eligible[0]?.id || '');}}).catch(e => {if (!c.signal.aborted) setConfigError(e.message || '参与居民加载失败');}); return () => c.abort();}, [agents]);
    const {result, loading, error, run, reset} = usePublicationPreview(task.id);
    useEscapeDismissal(true, onClose);
    return createPortal(<div data-modal-scroll-lock className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm" onClick={e => {if (e.target === e.currentTarget) onClose();}}>
        <section role="dialog" aria-modal="true" aria-labelledby="publish-preview-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 p-5"><h3 id="publish-preview-title" className="text-lg font-bold text-slate-900">发帖试运行预览</h3><button type="button" aria-label="关闭预览" onClick={onClose} className="shrink-0 whitespace-nowrap rounded-lg p-2 text-slate-500 hover:bg-slate-50"><X className="h-5 w-5"/></button></header>
            <div className="space-y-4 overflow-y-auto scrollbar-hide p-5">
                <p className="rounded-xl bg-orange-50 p-3 text-xs leading-relaxed text-orange-700">会产生模型和搜索调用费用；不会发布、扣体力或消耗自动机会。关闭窗口会停止等待结果。</p>
                <Select value={agentId} menuPortal options={bound.map(a => ({value: a.id, label: a.name}))} onChange={id => {if (!loading) {setAgentId(id); reset();}}} placeholder="选择参与居民"/>
                <button type="button" disabled={loading || !agentId} onClick={() => void run(agentId)} className="shrink-0 whitespace-nowrap rounded-lg bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600 disabled:opacity-50">{loading ? '正在选题、搜索与写作…' : '开始试运行'}</button>
                {configError && <p role="alert" className="text-sm text-red-600">{configError}</p>}
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                {result && <><p className="text-sm text-slate-700">{result.reason}</p>{result.snapshot?.selection && <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><p>{result.snapshot.selection.reason}</p>{result.snapshot.selection.expressionDirection && <p className="mt-2 text-xs">表达方向：{result.snapshot.selection.expressionDirection}</p>}<p className="mt-2 text-xs">搜索：{result.snapshot.selection.query}</p></div>}
                    {result.snapshot?.draft && <article className="space-y-3 rounded-xl border border-slate-200 p-4"><h4 className="text-base font-bold text-slate-900">{postDisplayTitle(result.snapshot.draft.title)}</h4><p className="text-xs text-slate-500">{result.snapshot.draft.summary}</p><div className="agent-post-body prose prose-slate max-w-none break-words text-sm text-slate-700"><AgentPostMarkdown content={result.snapshot.draft.content} materials={result.snapshot.materials}/></div></article>}
                    {!!result.snapshot?.materials.length && <div className="space-y-2"><h4 className="text-sm font-semibold text-slate-700">来源与素材</h4>{result.snapshot.materials.map(m => <div key={m.url} className="rounded-xl border border-slate-200 p-3"><a href={m.url} target="_blank" rel="noreferrer" className="break-words text-sm text-orange-600 underline">{m.title || m.url}</a><p className="mt-1 text-xs text-slate-500">{publishMaterialTime(m)}</p><p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600">{m.summary}</p></div>)}</div>}</>}
            </div>
        </section>
    </div>, document.body);
}
