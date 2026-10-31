import { quantHeadingIds } from '../../utils/quantMarkdownHeadings';
import { useQuantCopyFeedback } from '../../hooks/useQuantCopyFeedback';
import { memo, useId, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Check, Copy, Terminal } from 'lucide-react';
import { deduplicateMarkdown } from '../../utils/quant';
import 'katex/dist/katex.min.css';

function flattenText(node: ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(flattenText).join('');
    if (node && typeof node === 'object' && 'props' in node) {
        const props = (node as { props?: { children?: ReactNode } }).props;
        return flattenText(props?.children);
    }
    return '';
}

function CodeBlockCard({ language, code }: { language: string; code: string }) {
    const { copiedKey, error: copyError, copy } = useQuantCopyFeedback();
    const copied = copiedKey === 'copy';
    return (
        <div className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-slate-100 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-3.5 py-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-300">
                    <Terminal size={12} className="text-orange-400" />
                    {language || 'code'}
                </span>
                <button
                    type="button"
                    onClick={() => {
                        void copy(code);
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                    {copied ? <Check size={12} className="text-lime-400" /> : <Copy size={12} />}
                    {copied ? '已复制' : '复制'}
                </button>
            </div>
            {copyError && <p role="alert" className="px-4 pt-2 text-xs text-red-300">{copyError}</p>}
            <pre className="m-0 overflow-x-auto bg-transparent p-4 font-mono text-xs leading-6 text-slate-100 scrollbar-hide">
                <code>{code}</code>
            </pre>
        </div>
    );
}

export const ReportMarkdown = memo(function ReportMarkdown({
    text,
    stripTitle,
    stripSummary,
    headingScope,
    preserveOriginal = false,
}: {
    text: string;
    stripTitle?: string;
    stripSummary?: string;
    headingScope?: string;
    preserveOriginal?: boolean;
}) {
    const instanceScope = useId();
    const scope = headingScope ?? instanceScope;
    const cleaned = preserveOriginal ? text : deduplicateMarkdown(text, stripTitle, stripSummary);
    return (
        <div className="prose prose-slate max-w-none overflow-x-auto text-sm leading-7 prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-p:my-2.5 prose-p:leading-7 prose-a:font-medium prose-a:text-orange-600 prose-li:my-1 prose-strong:text-slate-900 scrollbar-hide">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath, [quantHeadingIds, { scope }]]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    img: ({ alt }) => (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            [图片：{alt || '报告配图'}]
                        </span>
                    ),
                    h1: ({ children, id }) => {
                        return (
                            <h1
                                id={id}
                                className="mt-5 mb-3 scroll-mt-24 border-b border-slate-100 pb-2 text-lg font-bold text-slate-900 first:mt-0"
                            >
                                {children}
                            </h1>
                        );
                    },
                    h2: ({ children, id }) => {
                        return (
                            <h2
                                id={id}
                                className="mt-6 mb-3 flex scroll-mt-24 items-center gap-2 text-base font-bold text-slate-900 first:mt-0"
                            >
                                <span
                                    aria-hidden="true"
                                    className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-orange-500 to-amber-500"
                                />
                                <span>{children}</span>
                            </h2>
                        );
                    },
                    h3: ({ children, id }) => {
                        return (
                            <h3
                                id={id}
                                className="mt-4 mb-2 scroll-mt-24 text-sm font-bold text-slate-800"
                            >
                                {children}
                            </h3>
                        );
                    },
                    blockquote: ({ children }) => (
                        <blockquote className="my-4 rounded-r-xl border-l-4 border-orange-400 bg-orange-50/40 px-4 py-2.5 text-sm leading-7 text-slate-700 not-italic">
                            {children}
                        </blockquote>
                    ),
                    table: ({ children }) => (
                        <div className="my-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs scrollbar-hide">
                            <table className="m-0 w-full border-collapse text-left text-xs sm:text-sm">
                                {children}
                            </table>
                        </div>
                    ),
                    thead: ({ children }) => (
                        <thead className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold text-slate-600">
                            {children}
                        </thead>
                    ),
                    th: ({ children }) => <th className="px-3.5 py-2.5 font-semibold text-slate-700">{children}</th>,
                    td: ({ children }) => (
                        <td className="border-t border-slate-100 px-3.5 py-2.5 align-top text-slate-700">
                            {children}
                        </td>
                    ),
                    code: ({ className, children }) => {
                        const raw = flattenText(children).replace(/\n$/, '');
                        const langMatch = /language-([\w-]+)/.exec(className || '');
                        const isBlock = Boolean(langMatch) || raw.includes('\n');
                        if (isBlock) {
                            return <CodeBlockCard language={langMatch?.[1] || ''} code={raw} />;
                        }
                        return (
                            <code className="rounded-md border border-slate-200/70 bg-slate-100/80 px-1.5 py-0.5 font-mono text-xs font-medium text-orange-700 before:content-none after:content-none">
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children }) => <>{children}</>,
                }}
            >
                {cleaned || (text ? text : '报告正文已清空。')}
            </ReactMarkdown>
        </div>
    );
});
