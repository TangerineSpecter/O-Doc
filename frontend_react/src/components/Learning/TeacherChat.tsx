import {useState} from 'react';
import type {ChatMessage} from '../../types/api/learning';
import {buttonClass, cardClass, inputClass} from './presentation';

export default function TeacherChat({name, messages, busy, pending, send}: {name: string; messages: ChatMessage[]; busy: boolean; pending: boolean; send: (message: string) => Promise<void>}) {
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    return <section className={`${cardClass} flex min-h-64 flex-col`}>
        <h2 className="font-semibold text-slate-800">与{name}交流</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">可追问讲解与学习建议。提交前只给提示；使用帮助会标记辅助作答。</p>
        <div className="my-4 max-h-80 space-y-3 overflow-y-auto scrollbar-hide" aria-live="polite">
            {!messages.length && <p className="py-6 text-center text-sm text-slate-400">先聊聊你的目标，或完成一道题后追问。</p>}
            {messages.map(m => <div key={m.id} className={`rounded-xl p-3 text-sm leading-relaxed ${m.role === 'user' ? 'ml-6 bg-orange-50 text-slate-700' : 'mr-3 bg-slate-50 text-slate-700'}`}><p className="mb-1 text-[10px] text-slate-400">{m.role === 'user' ? '我' : name}</p><p className="whitespace-pre-wrap break-words">{m.content}</p></div>)}
            {pending && <p className="text-sm text-orange-600">老师正在回复…</p>}
        </div>
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <form className="mt-auto space-y-2" onSubmit={async e => {e.preventDefault(); setError(''); try {await send(text); setText('');} catch (err) {setError(err instanceof Error ? err.message : '发送失败');}}}>
            <textarea aria-label="向老师提问" maxLength={3000} rows={3} className={`${inputClass} resize-none`} placeholder="这句话为什么这样表达？" value={text} onChange={e => setText(e.target.value)}/>
            <button disabled={busy || pending || !text.trim()} className={buttonClass}>向老师提问</button>
        </form>
    </section>;
}
