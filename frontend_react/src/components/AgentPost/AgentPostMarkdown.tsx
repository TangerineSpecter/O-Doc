import {ReactNode} from 'react';
import ReactMarkdown, {defaultUrlTransform} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {AgentPostReferences} from './AgentPostReferences';
import {splitPostReferences} from './postPresentation';
import {CodeBlock, CUSTOM_STYLES, MermaidChart, rehypeInlineStyleSyntax, remarkQuoteVariants, SimpleChart, VariantBlockquote} from '../Article/MarkdownElements';

const getMarkdownNodeText = (node: ReactNode): string => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getMarkdownNodeText).join('');
    if (node && typeof node === 'object' && 'props' in node) {
        return getMarkdownNodeText((node as { props?: { children?: ReactNode } }).props?.children);
    }
    return '';
};

const getMarkdownHeadingId = (children: ReactNode) => getMarkdownNodeText(children)
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

const AgentPostBlockquote = ({children, ...props}: {children: ReactNode; [key: string]: any}) => {
    const variant = props['data-quote-variant'] || props.node?.properties?.['data-quote-variant'];
    if (variant === 'takeaway') {
        return (
            <div className="agent-post-takeaway">
                <span className="agent-post-takeaway-badge">KEY TAKEAWAY</span>
                <div className="text-[17px] font-extrabold text-slate-900 leading-snug [&_p]:my-1.5 [&_p]:leading-relaxed">
                    {children}
                </div>
            </div>
        );
    }
    return (
        <blockquote className="my-6 pl-4 border-l-2 border-orange-500 text-slate-700 text-[15.5px] leading-relaxed font-normal not-italic [&_p]:my-1.5 [&_p]:leading-relaxed">
            {children}
        </blockquote>
    );
};

const agentPostMarkdownComponents = {
    pre: (props: any) => <div className="not-prose">{props.children}</div>,
    code(props: any) {
        const {inline, className, children, ...rest} = props;
        const match = /language-(\w+)/.exec(className || '');
        const lang = match ? match[1] : '';
        const codeStr = String(children).replace(/\n$/, '');

        if (!inline && lang === 'mermaid') {
            return <MermaidChart chart={codeStr} />;
        }

        if (!inline && lang === 'chart') {
            return <SimpleChart chart={codeStr} />;
        }

        if (!inline && match) {
            return <CodeBlock language={lang} code={codeStr} {...rest} />;
        }

        return (
            <code
                className="article-inline-code bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] mx-1 break-words leading-[1.9]"
                {...props}
            >
                {children}
            </code>
        );
    },
    h2: ({children, ...props}: { children: ReactNode; [key: string]: any }) => {
        const text = getMarkdownNodeText(children).trim();
        const lower = text.toLowerCase();
        const isFootnote = lower === 'footnotes' || lower === 'footnote' || props.id === 'footnote-label' || props['data-footnote-label'];

        if (isFootnote) {
            return <h2 id={props.id || 'footnote-label'} className="sr-only">{children}</h2>;
        }

        const isReferenceHeading = lower === '参考资料' || lower === '参考文献' || lower === '参考来源' || lower === '资料来源';
        if (isReferenceHeading) {
            return (
                <h2 id={getMarkdownHeadingId(children)} className="agent-post-non-chapter-heading text-base font-bold text-slate-800 mt-8 mb-3 border-t border-slate-100 pt-5">
                    {children}
                </h2>
            );
        }

        return (
            <h2 id={getMarkdownHeadingId(children)} className="agent-post-chapter-heading">
                <span className="agent-post-chapter-title">{children}</span>
            </h2>
        );
    },
    blockquote: AgentPostBlockquote,
    img: ({src, alt}: {src?: string; alt?: string}) => {
        if (typeof src === 'string' && src.startsWith('odoc-illustration:')) {
            const failed = alt === '配图失败';
            return (
                <span
                    role="status"
                    className={`my-4 flex min-h-28 items-center justify-center rounded-xl border border-dashed px-4 text-sm ${failed ? 'border-red-200 bg-red-50 text-red-600' : 'border-orange-200 bg-orange-50 text-orange-700'}`}
                >
                    {failed ? '配图失败' : '配图生成中'}
                </span>
            );
        }
        if (!src) {
            return null;
        }
        return <img src={src} alt={alt || ''} className="my-4 max-h-[28rem] w-full rounded-xl object-contain" />;
    },
};

export function AgentPostMarkdown({content, materials}: {content: string; materials?: {url: string; title: string}[]}) {
    const {body, references} = splitPostReferences(content);
    return <><style>{CUSTOM_STYLES}</style><ReactMarkdown
        remarkPlugins={[remarkQuoteVariants, remarkGfm]}
        rehypePlugins={[rehypeInlineStyleSyntax]}
        components={agentPostMarkdownComponents as any}
        urlTransform={url => url.startsWith('odoc-illustration:') ? url : defaultUrlTransform(url)}
    >{body}</ReactMarkdown><AgentPostReferences references={references} materials={materials}/></>;
}
