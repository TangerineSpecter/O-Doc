import { markdownHeadings } from './quantMarkdownHeadings';
import type { QuantCodeVersion, QuantImplementation } from '../types/api/quant';

export const quantKindOptions = [
    { value: 'factor' as const, label: '因子' },
    { value: 'indicator' as const, label: '指标' },
    { value: 'strategy' as const, label: '策略' },
];
export const quantLanguageOptions = [
    { value: 'python' as const, label: 'Python' },
    { value: 'pine' as const, label: 'Pine Script' },
    { value: 'mql4' as const, label: 'MQL4' },
];
export function quantVersionLabel(implementation: QuantImplementation, version: QuantCodeVersion) {
    return `${implementation.name} · ${version.id.slice(0, 8)}${version.id === implementation.currentVersionId ? '（当前）' : ''}`;
}

/** Only plain text scripts are read into drafts. Notebooks/reports remain attachments. */
export function quantScriptLanguage(name: string): 'python' | 'pine' | 'mql4' | null {
    const extension = name.toLowerCase().split('.').pop();
    if (extension === 'py') return 'python';
    if (extension === 'pine') return 'pine';
    if (extension === 'mq4' || extension === 'mqh') return 'mql4';
    return null;
}

export function quantTags(value: string): string[] {
    return [
        ...new Set(
            value
                .split(/[,，\n]/)
                .map((tag) => tag.trim())
                .filter(Boolean),
        ),
    ];
}

export function quantError(error: unknown): string {
    return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试';
}

export function downloadQuantBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function quantFilename(name: string, language: string): string {
    const extension: Record<string, string> = { python: 'py', pine: 'pine', mql4: 'mq4', mql5: 'mq5' };
    return `${name.replace(/[\\/:*?"<>|]/g, '_') || 'quant'}.${extension[language] || 'txt'}`;
}

export function quantDate(value?: string): string {
    if (!value) return '尚未更新';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Clipboard API is unavailable on HTTP LAN deployments; retain a user-triggered fallback. */
export async function copyQuantText(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch {
            /* Try the document clipboard path below. */
        }
    }
    const previous = document.activeElement as HTMLElement | null;
    const field = document.createElement('textarea');
    field.value = value;
    field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;resize:none';
    field.setAttribute('aria-hidden', 'true');
    document.body.appendChild(field);
    try {
        field.select();
        if (!document.execCommand('copy')) throw new Error('复制失败，可在编辑器内全选并复制');
    } finally {
        field.remove();
        previous?.focus({ preventScroll: true });
    }
}

export { slugifyHeading } from './quantMarkdownHeadings';

export function deduplicateMarkdown(text: string, stripTitle?: string, stripSummary?: string): string {
    if (!text) return '';
    let result = text.trimStart();

    if (stripTitle?.trim()) {
        const firstLineMatch = /^#\s+([^\r\n]+)\r?\n+/.exec(result);
        if (firstLineMatch) {
            const headingText = firstLineMatch[1].trim();
            const targetTitle = stripTitle.trim();
            if (headingText === targetTitle || headingText.includes(targetTitle) || targetTitle.includes(headingText)) {
                result = result.slice(firstLineMatch[0].length).trimStart();
            }
        }
    }

    if (stripSummary?.trim()) {
        const cleanSummary = stripSummary.trim();
        if (result.startsWith(cleanSummary)) {
            result = result.slice(cleanSummary.length).trimStart();
        }
    }

    return result;
}

export function extractMarkdownHeadings(markdown: string, stripTitle?: string, scope = '', stripSummary?: string) {
    return markdownHeadings(deduplicateMarkdown(markdown, stripTitle, stripSummary), scope);
}
