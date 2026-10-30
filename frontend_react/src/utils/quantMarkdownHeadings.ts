import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

interface MarkdownNode {
    type: string;
    depth?: number;
    value?: string;
    alt?: string | null;
    children?: MarkdownNode[];
    data?: { hProperties?: Record<string, unknown> };
}
export interface QuantMarkdownHeading { level: number; text: string; id: string }

export function slugifyHeading(text: string): string {
    return 'quant-sec-' + text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

function headingText(node: MarkdownNode): string {
    if (node.type === 'image') return node.alt || '';
    return node.children ? node.children.map(headingText).join('') : node.value || '';
}

/** Both the TOC and rendered Markdown use this AST pass and collision rule. */
function annotate(tree: MarkdownNode, scope: string): QuantMarkdownHeading[] {
    const headings: QuantMarkdownHeading[] = [];
    const used = new Set<string>();
    const visit = (node: MarkdownNode) => {
        if (node.type === 'heading' && node.depth) {
            const text = headingText(node).trim();
            const base = (scope ? `${scope}-` : '') + slugifyHeading(text);
            let id = base, suffix = 2;
            while (used.has(id)) id = `${base}-${suffix++}`;
            used.add(id);
            node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
            if (node.depth <= 3 && text) headings.push({ level: node.depth, text, id });
        }
        node.children?.forEach(visit);
    };
    visit(tree);
    return headings;
}

export function quantHeadingIds(options: { scope: string }) {
    return (tree: MarkdownNode) => { annotate(tree, options.scope); };
}

export function markdownHeadings(markdown: string, scope = ''): QuantMarkdownHeading[] {
    const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown);
    return annotate(tree, scope);
}
