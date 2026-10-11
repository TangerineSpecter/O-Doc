import {useRef, useState} from 'react';
import {AlertCircle, ArrowRight, Loader2, MessageSquare, Pencil, RotateCcw} from 'lucide-react';
import {learningApi} from '../../api/learning';
import type {Attempt} from '../../types/api/learning';
import {buttonClass, inputClass, statusName} from './presentation';

export interface RevisionPanelProps {
    collId: string;
    attempt: Attempt;
    questionId: string;
    busy: boolean;
    act: (fn: () => Promise<unknown>) => Promise<void>;
    open?: boolean;
    onToggleOpen?: (open: boolean) => void;
}

export default function RevisionPanel({
    collId,
    attempt,
    questionId,
    busy,
    act,
    open: externalOpen,
    onToggleOpen,
}: RevisionPanelProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
    const setIsOpen = (val: boolean | ((prev: boolean) => boolean)) => {
        const nextVal = typeof val === 'function' ? val(isOpen) : val;
        if (onToggleOpen) {
            onToggleOpen(nextVal);
        } else {
            setInternalOpen(nextVal);
        }
    };

    const [text, setText] = useState('');
    const keys = useRef(new Map<string, string>());
    const revisions = attempt.revisions.filter(r => r.questionId === questionId);
    const pending = attempt.revisions.some(r => ['pending', 'running'].includes(r.status));

    const send = (revisionId?: string) =>
        void act(async () => {
            const identity = revisionId || text;
            const key = keys.current.get(identity) || crypto.randomUUID();
            keys.current.set(identity, key);
            await learningApi.revise(collId, attempt.id, questionId, text, key, revisionId);
            keys.current.delete(identity);
            setText('');
            setIsOpen(false);
        });

    return (
        <div className="space-y-3">
            {/* 仅在未外部接管触发按钮时展示默认展开按钮 */}
            {externalOpen === undefined && (
                <div className="flex items-center justify-end">
                    <button
                        type="button"
                        disabled={busy || pending}
                        className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-orange-600 transition-colors hover:text-orange-700 disabled:opacity-40"
                        onClick={() => setIsOpen(v => !v)}
                    >
                        <Pencil size={12} />
                        <span>{isOpen ? '收起订正' : '根据讲解，再表达一次'}</span>
                    </button>
                </div>
            )}

            {/* 订正输入区 */}
            {isOpen && (
                <div className="space-y-3 rounded-xl border border-orange-200/90 bg-gradient-to-br from-orange-50/40 via-amber-50/20 to-white p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">答后针对性订正</span>
                        <span className="text-slate-400">保留原答案与成绩 · 用于加深记忆</span>
                    </div>

                    <textarea
                        aria-label="答后订正"
                        maxLength={3000}
                        rows={3}
                        className={`${inputClass} resize-none min-h-[80px] bg-white`}
                        placeholder="根据刚才老师的讲解与提示，尝试重新用英文表达一遍…"
                        value={text}
                        onChange={e => setText(e.target.value)}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-400">
                            {text.length}/3000
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={busy || pending}
                                onClick={() => setIsOpen(false)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                disabled={busy || pending || !text.trim()}
                                className={`${buttonClass} inline-flex items-center gap-1.5`}
                                onClick={() => send()}
                            >
                                {pending ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                                <span>提交订正，请老师反馈</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 历史订正记录列表 */}
            {revisions.length > 0 && (
                <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold text-slate-500">
                        订正记录（{revisions.length} 次）：
                    </p>
                    <div className="space-y-2.5">
                        {revisions.map((r, idx) => (
                            <article
                                key={r.id}
                                className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs leading-relaxed"
                            >
                                <div className="flex items-center justify-between text-[11px] text-slate-400">
                                    <span>第 {idx + 1} 次订正</span>
                                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-start gap-1.5 text-slate-400">
                                        <span className="shrink-0 font-medium">原表达：</span>
                                        <span className="break-words font-sans line-through opacity-80">
                                            {r.originalAnswer}
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-1.5 font-medium text-slate-800">
                                        <span className="shrink-0 text-orange-600">订正为：</span>
                                        <span className="break-words font-sans">
                                            {r.content}
                                        </span>
                                    </div>
                                </div>

                                {/* 老师反馈 */}
                                <div className="rounded-lg border border-orange-100 bg-orange-50/60 p-2.5 text-slate-700">
                                    <div className="flex items-center gap-1 text-[11px] font-semibold text-orange-800 mb-1">
                                        <MessageSquare size={12} className="text-orange-600" />
                                        <span>老师反馈</span>
                                        {r.status !== 'completed' && (
                                            <span className="ml-1 text-[10px] text-slate-400 font-normal">
                                                ({statusName[r.status] || r.status})
                                            </span>
                                        )}
                                    </div>
                                    <p className="whitespace-pre-wrap break-words leading-relaxed text-slate-600">
                                        {r.feedback || statusName[r.status] || '等待老师批阅中…'}
                                    </p>
                                </div>

                                {r.status === 'failed' && (
                                    <div className="flex items-center justify-between text-xs text-rose-600 pt-1">
                                        <span className="flex items-center gap-1">
                                            <AlertCircle size={13} />
                                            <span>订正反馈生成失败</span>
                                        </span>
                                        <button
                                            type="button"
                                            disabled={busy || pending}
                                            className="inline-flex items-center gap-1 font-medium text-orange-600 hover:underline"
                                            onClick={() => send(r.id)}
                                        >
                                            <RotateCcw size={12} />
                                            <span>重试反馈</span>
                                        </button>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
