import {defaultSchema} from 'rehype-sanitize';
import type {Options as SanitizeSchema} from 'rehype-sanitize';

const appendUnique = <T,>(values: T[] | null | undefined, additions: T[]) => [
    ...(values || []),
    ...additions.filter(item => !(values || []).includes(item)),
];

export const markdownSanitizeSchema: SanitizeSchema = {
    ...defaultSchema,
    tagNames: appendUnique(defaultSchema.tagNames, ['iframe', 'video', 'source']),
    attributes: {
        ...defaultSchema.attributes,
        code: [
            ...(defaultSchema.attributes?.code || []),
            ['className', /^language-./, 'math-inline', 'math-display'],
        ],
        span: [
            ...(defaultSchema.attributes?.span || []),
            [
                'className',
                'md-tag-inline',
                'custom-underline-red',
                'custom-underline-wavy',
                'custom-watercolor',
            ],
        ],
        blockquote: [
            ...(defaultSchema.attributes?.blockquote || []),
            ['data-quote-variant', 'danger', 'warning', 'info'],
        ],
        iframe: [
            'src',
            'width',
            'height',
            'title',
            'allow',
            'allowFullScreen',
            'frameBorder',
        ],
        video: [
            'src',
            'width',
            'height',
            'poster',
            'preload',
            'controls',
            'autoPlay',
            'loop',
            'muted',
            'playsInline',
        ],
        source: [
            ...(defaultSchema.attributes?.source || []),
            'src',
            'type',
        ],
    },
    protocols: {
        ...defaultSchema.protocols,
        src: ['http', 'https'],
        poster: ['http', 'https'],
    },
};

const parseContentUrl = (value: string): URL | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
        return new URL(trimmed, window.location.origin);
    } catch {
        return null;
    }
};

export const getSafeIframeUrl = (value: string): string | null => {
    const parsed = parseContentUrl(value);
    if (!parsed || parsed.protocol !== 'https:' || parsed.hostname !== 'player.bilibili.com') {
        return null;
    }
    return parsed.toString();
};

export const getSafeVideoUrl = (value: string): string | null => {
    const trimmed = value.trim();
    const parsed = parseContentUrl(trimmed);
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) return null;

    if (trimmed.startsWith('/')) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
};
