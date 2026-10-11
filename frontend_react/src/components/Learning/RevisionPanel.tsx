import {useRef, useState} from 'react';
import {learningApi} from '../../api/learning';
import type {Attempt} from '../../types/api/learning';
import {buttonClass, inputClass, statusName} from './presentation';

export default function RevisionPanel({collId, attempt, questionId, busy, act}: {collId: string; attempt: Attempt; questionId: string; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void>}) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const keys = useRef(new Map<string, string>());
    const revisions = attempt.revisions.filter(r => r.questionId === questionId);
    const pending = attempt.revisions.some(r => ['pending', 'running'].includes(r.status));
    const send = (revisionId?: string) => void act(async () => {
        const identity = revisionId || text;
        const key = keys.current.get(identity) || crypto.randomUUID();
        keys.current.set(identity, key);
        await learningApi.revise(collId, attempt.id, questionId, text, key, revisionId);
        keys.current.delete(identity); setText(''); setOpen(false);
    });
    return <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <button disabled={busy || pending} className="whitespace-nowrap shrink-0 text-xs font-medium text-orange-600" onClick={() => setOpen(v => !v)}>{open ? '收起订正' : '根据讲解，再表达一次'}</button>
        {open && <div className="space-y-3"><p className="text-xs text-slate-500">订正用于学习，保留原答案与成绩，不增加独立掌握证据。</p><textarea aria-label="答后订正" maxLength={3000} rows={3} className={`${inputClass} resize-none`} value={text} onChange={e => setText(e.target.value)}/><button disabled={busy || pending || !text.trim()} className={buttonClass} onClick={() => send()}>提交订正，请老师反馈</button></div>}
        {revisions.map(r => <article key={r.id} className="space-y-2 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed"><p className="whitespace-pre-wrap break-words text-slate-400">原答案：{r.originalAnswer}</p><p className="whitespace-pre-wrap break-words text-slate-700">订正：{r.content}</p><p className="whitespace-pre-wrap text-slate-500">{r.feedback || statusName[r.status]}</p>{r.status === 'failed' && <button disabled={busy || pending} className="whitespace-nowrap shrink-0 text-orange-600" onClick={() => send(r.id)}>重试反馈</button>}</article>)}
    </div>;
}
