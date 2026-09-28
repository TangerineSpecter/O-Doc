import {useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Expand, X} from 'lucide-react';
import {useEscapeDismissal} from '@/hooks/useEscapeDismissal';

interface Props {
    name: string;
    value: string;
    onChange: (value: string) => void;
    subject?: 'Agent' | '技能' | '任务';
    readOnly?: boolean;
}

export function PromptEditorModal({name, value, onChange, subject = 'Agent', readOnly = false}: Props) {
    const [open, setOpen] = useState(false);
    const titleId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const close = () => {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
    };

    useEscapeDismissal(open, close);

    return <>
        <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
        >
            <Expand className="h-3.5 w-3.5"/>{readOnly ? '展开查看' : '展开编辑'}
        </button>
        {open && createPortal(
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-150">
                <button type="button" aria-label="关闭提示词编辑窗口" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={close}/>
                <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex max-h-[84vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-2xl shadow-slate-900/20 animate-in zoom-in-95 duration-150">
                    <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                        <div className="min-w-0">
                            <h2 id={titleId} className="text-base font-bold text-slate-900">{readOnly ? '查看提示词' : '编辑提示词'}</h2>
                            <p className="mt-1 truncate text-xs text-slate-500">{name ? `${subject}：${name}` : subject === 'Agent' ? '编辑 Agent 的角色、工作方式和输出要求' : subject === '任务' ? '编辑任务目标、参考来源和输出要求' : '编辑技能的目标、输入要求、输出格式和边界'}</p>
                        </div>
                        <button type="button" aria-label="关闭" onClick={close} className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                            <X className="h-4 w-4"/>
                        </button>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                        <textarea
                            autoFocus
                            aria-label={`${readOnly ? '查看' : '编辑'} ${subject} 提示词`}
                            value={value}
                            readOnly={readOnly}
                            onChange={event => onChange(event.target.value)}
                            placeholder={subject === 'Agent' ? '描述这个 Agent 的角色、工作方式、边界和输出风格' : subject === '任务' ? '写清楚这个任务要做什么、参考哪些来源、输出格式和注意事项' : '写清楚技能目标、输入要求、输出格式和边界'}
                            className="min-h-[45vh] w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        />
                    </div>
                    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3 sm:px-6">
                        <p className="text-xs text-slate-500">{readOnly ? '系统技能提示词由内置文档管理，此处仅供查看。' : `内容会同步到提示词框，关闭后仍需保存${subject === 'Agent' ? ' Agent' : subject === '任务' ? '任务' : '技能'}。`}当前 {value.length} 字</p>
                        <button type="button" onClick={close} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600">完成</button>
                    </footer>
                </section>
            </div>,
            document.body,
        )}
    </>;
}
