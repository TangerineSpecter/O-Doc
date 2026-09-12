import {useEffect, useMemo, useRef, useState} from 'react';
import {ExternalLink, X} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {getAgentRunRecord} from '../../api/setting';
import type {AgentActivity, AgentRunRecordConfig} from '../../types/api/setting';
import StarLoader from '../common/StarLoader';

const visibleStepTitles = new Set(['开始执行', '调用 AI 生成内容', 'AI 内容生成完成', '执行结束', 'API Key 已失效', '执行失败']);

export default function AgentRunDrawer({activity, onClose}: {activity: AgentActivity | null; onClose: () => void}) {
    const [record, setRecord] = useState<AgentRunRecordConfig | null>(null);
    const [error, setError] = useState('');
    const dialogRef = useRef<HTMLElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        let active = true;
        setRecord(null);
        setError('');
        if (!activity?.runRecordId) return () => { active = false; };
        getAgentRunRecord(activity.runRecordId)
            .then(result => { if (active) setRecord(result); })
            .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : '加载执行结果失败'); });
        return () => { active = false; };
    }, [activity]);

    useEffect(() => {
        if (!activity) return;
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(element => !element.hasAttribute('hidden'));
            if (!focusable.length) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocused?.focus();
        };
    }, [activity]);

    const agentRun = useMemo(() => record?.agentRuns?.find(item => item.agent === activity?.agent.id), [activity?.agent.id, record]);
    const output = agentRun?.content || record?.output || '';
    const steps = (agentRun?.steps || record?.steps || []).filter(step => visibleStepTitles.has(step.title));

    if (!activity) return null;
    return (
        <div className="fixed inset-0 z-[120] flex justify-end">
            <button type="button" tabIndex={-1} aria-label="关闭执行详情" onClick={onClose} className="absolute inset-0 bg-slate-900/35 backdrop-blur-[1px]"/>
            <aside ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="agent-run-drawer-title" tabIndex={-1} className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
                <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                    <div className="min-w-0">
                        <div className="text-xs font-medium text-orange-600">{activity.agent.name} 的执行结果</div>
                        <h2 id="agent-run-drawer-title" className="mt-1 truncate text-lg font-bold text-slate-900">{activity.title}</h2>
                    </div>
                    <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <X className="h-5 w-5"/>
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto px-5 py-5">
                    {!record && !error && <div className="flex min-h-48 items-center justify-center"><StarLoader/></div>}
                    {error && <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
                    {record && (
                        <div className="space-y-6">
                            <section>
                                <h3 className="text-sm font-bold text-slate-900">精选过程</h3>
                                <div className="mt-3 space-y-2">
                                    {steps.length ? steps.map((step, index) => (
                                        <div key={`${step.time}-${index}`} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-400"/>
                                            <div>
                                                <div className="text-xs font-semibold text-slate-700">{step.title}</div>
                                                {step.detail && step.title !== '执行失败' && <div className="mt-1 text-xs text-slate-400">{step.detail}</div>}
                                            </div>
                                        </div>
                                    )) : <div className="text-sm text-slate-400">暂无可展示过程</div>}
                                </div>
                            </section>
                            <section>
                                <h3 className="text-sm font-bold text-slate-900">完整输出</h3>
                                {output ? (
                                    <div className="prose prose-slate mt-3 max-w-none rounded-xl border border-slate-200 bg-white p-4 text-sm">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
                                    </div>
                                ) : <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">本次执行没有正文输出</div>}
                            </section>
                        </div>
                    )}
                </div>
                <footer className="border-t border-slate-100 bg-slate-50 px-5 py-3">
                    <a href="/settings?tab=agent" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-orange-600">
                        查看技术执行记录 <ExternalLink className="h-3.5 w-3.5"/>
                    </a>
                </footer>
            </aside>
        </div>
    );
}
