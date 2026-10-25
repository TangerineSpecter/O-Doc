import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
export function ReportMarkdown({ text }: { text: string }) {
    return <div className="prose prose-slate max-w-none overflow-x-auto text-sm prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-a:text-orange-600 scrollbar-hide">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{img: ({alt}) => <span>[图片：{alt || '报告配图'}]</span>}}>{text || '报告正文已清空。'}</ReactMarkdown>
    </div>;
}

