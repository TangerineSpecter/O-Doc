import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import {remarkQuoteVariants} from './MarkdownElements';
import {markdownSanitizeSchema} from '../../utils/markdownSecurity';

const remarkSoftLineBreaks = () => {
    const visit = (node: any) => {
        if (!Array.isArray(node.children)) return;

        const nextChildren: any[] = [];
        node.children.forEach((child: any) => {
            if (child.type === 'text' && child.value.includes('\n')) {
                const lines = child.value.split('\n');
                lines.forEach((line: string, index: number) => {
                    if (line) nextChildren.push({...child, value: line});
                    if (index < lines.length - 1) nextChildren.push({type: 'break'});
                });
                return;
            }

            visit(child);
            nextChildren.push(child);
        });
        node.children = nextChildren;
    };

    return (tree: any) => visit(tree);
};

interface ArticleMarkdownProps {
    content: string;
    components: Record<string, unknown>;
    annotationPlugin: unknown;
}

export const ArticleMarkdown = ({content, components, annotationPlugin}: ArticleMarkdownProps) => (
    <ReactMarkdown
        remarkPlugins={[remarkQuoteVariants, remarkSoftLineBreaks, remarkGfm, remarkMath]}
        rehypePlugins={[
            rehypeRaw,
            [rehypeSanitize, markdownSanitizeSchema],
            rehypeKatex,
            annotationPlugin as any,
        ]}
        components={components as any}
    >
        {content}
    </ReactMarkdown>
);
