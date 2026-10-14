import {useEscapeDismissal} from '@/hooks/useEscapeDismissal';
import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Loader2, Sparkles, Undo2, X} from 'lucide-react';
import {organizeAgentRole} from '@/api/agentPrompt';
import type {RoleDraft, RoleProfile} from '@/types/api/agentPrompt';
import {emptyRoleProfile, fullRoleText} from '@/utils/agentRole';
import {PromptEditorModal} from '@/components/common/PromptEditorModal';
import {RoleProfileFields} from './RoleProfileFields';
import {AgentPromptGenerator} from './AgentPromptGenerator';

interface Props {
    name: string; avatar: string; modelId: string; prompt: string; roleProfile: Partial<RoleProfile>;
    avatarUploading: boolean; onChange: (profile: RoleProfile, prompt: string) => void;
}
export function AgentRoleEditor(props: Props) {
    const {name, prompt, roleProfile, modelId, onChange} = props;
    const trigger = useRef<HTMLButtonElement>(null);
    const signature = JSON.stringify([name, prompt, roleProfile, modelId]);
    const latest = useRef(signature); latest.current = signature;
    const request = useRef<AbortController | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<{source: string; draft: RoleDraft} | null>(null);
    const closePreview = () => {setPreview(null); requestAnimationFrame(() => trigger.current?.focus());};
    useEscapeDismissal(Boolean(preview), closePreview);
    const [undo, setUndo] = useState<{profile: RoleProfile; prompt: string; applied: string} | null>(null);
    useEffect(() => {
        request.current?.abort(); setBusy(false); setPreview(null);
        return () => request.current?.abort();
    }, [signature]);
    const organize = async (source = prompt) => {
        request.current?.abort();
        const controller = new AbortController(); request.current = controller;
        setBusy(true); setError('');
        try {
            const draft = await organizeAgentRole({name, prompt: source, roleProfile}, controller.signal);
            if (!controller.signal.aborted && latest.current === signature) setPreview({source: signature, draft});
        } catch (cause) {
            if (!controller.signal.aborted && latest.current === signature) setError(cause instanceof Error ? cause.message : '整理失败，原设定未修改');
        } finally {
            if (request.current === controller) setBusy(false);
        }
    };
    const apply = () => {
        if (!preview || preview.source !== latest.current) return;
        const {draft} = preview;
        setUndo({profile: {...emptyRoleProfile, ...roleProfile}, prompt, applied: JSON.stringify([name, draft.prompt, draft.roleProfile, modelId])});
        onChange(draft.roleProfile, draft.prompt); setPreview(null);
    };
    return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-800">角色设定</h3><div className="flex gap-2">
            <PromptEditorModal name={name} value={fullRoleText(name, roleProfile, prompt)} onChange={() => {}} readOnly/>
            <button ref={trigger} type="button" disabled={busy || !name.trim()} onClick={() => void organize()} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}{busy ? '正在整理…' : '整理角色设定'}</button>
        </div></div>
        <RoleProfileFields value={roleProfile} onChange={value => onChange(value, prompt)}/>
        <label className="block space-y-1.5 text-sm font-semibold text-slate-700">补充提示词<textarea id="agent-prompt" value={prompt} onChange={event => onChange({...emptyRoleProfile, ...roleProfile}, event.target.value)} rows={5} maxLength={40000} className="w-full resize-none scrollbar-hide rounded-xl border border-slate-200 px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-orange-500/20" placeholder="旧角色设定或需要在所有场景生效的补充要求，可留空"/></label>
        <p className="text-xs leading-5 text-slate-500">姓名使用上方名称。补充提示词会在所有场景加入一次；整理后只保留公共补充要求。具体性格优先于 MBTI 标签。</p>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {undo?.applied === signature && <button type="button" onClick={() => {onChange(undo.profile, undo.prompt); setUndo(null);}} className="inline-flex items-center gap-1 text-xs text-lime-700"><Undo2 className="h-3 w-3"/>撤销整理应用</button>}
        <details><summary className="cursor-pointer text-xs text-slate-500">从零生成角色</summary><div className="mt-3"><AgentPromptGenerator key={signature} name={name} avatar={props.avatar} modelId={modelId} prompt={prompt} avatarUploading={props.avatarUploading} onApply={value => void organize(value)} onApplyRole={(profile, extra) => {if (latest.current === signature) setPreview({source: signature, draft: {roleProfile: profile, prompt: extra, warnings: ['这是新生成的创作设定，请确认后应用；原设定仍保留。']}});}}/></div></details>
        {preview && createPortal(<div data-modal-scroll-lock className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 p-4">
            <section role="dialog" aria-modal="true" aria-label="角色整理预览" className="flex max-h-[85dvh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
                <header className="flex items-center justify-between border-b border-slate-100 p-4"><h3 className="font-bold text-slate-800">整理预览</h3><button type="button" autoFocus aria-label="关闭整理预览" onClick={closePreview}><X className="h-5 w-5"/></button></header>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-hide p-5">
                    <p className="text-xs text-slate-500">确认前不会修改原设定；应用后仍需保存 Agent。</p>
                    {preview.draft.warnings.map((warning, index) => <p key={index} className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{warning}</p>)}
                    <RoleProfileFields value={preview.draft.roleProfile} onChange={profile => setPreview({...preview, draft: {...preview.draft, roleProfile: profile}})}/>
                    <label className="block text-sm font-semibold text-slate-700">保留的补充提示词<textarea rows={5} className="mt-2 w-full resize-none scrollbar-hide rounded-xl border border-slate-200 p-3 text-sm" value={preview.draft.prompt} onChange={event => setPreview({...preview, draft: {...preview.draft, prompt: event.target.value}})}/></label>
                </div>
                <footer className="flex justify-end gap-3 border-t border-slate-100 p-4"><button type="button" onClick={closePreview} className="text-sm text-slate-600">取消</button><button type="button" onClick={apply} disabled={preview.source !== signature} className="rounded-lg bg-orange-500 px-4 py-2 text-sm text-white disabled:opacity-50">确认应用</button></footer>
            </section>
        </div>, document.body)}
    </section>;
}
