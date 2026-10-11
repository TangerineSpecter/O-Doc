import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
export function Prose({text}: {text: string}) {
    return <div className="prose prose-slate max-w-none break-words prose-headings:font-semibold prose-p:leading-8 prose-a:text-orange-600"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{text || '这里还没有正文。'}</ReactMarkdown></div>;
}
