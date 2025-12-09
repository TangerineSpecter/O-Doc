import {useEffect, useMemo, useState} from 'react';

export interface HeaderItem {
    text: string;
    level: number;
    slug: string;
}

export interface ArticleStats {
    wordCount: number;
    readTime: number;
}

export const useArticle = (content?: string, scrollContainerId?: string) => {
    const [headers, setHeaders] = useState<HeaderItem[]>([]);
    const [activeHeader, setActiveHeader] = useState("");
    const [stats, setStats] = useState<ArticleStats>({ wordCount: 0, readTime: 0 });
    const [showScrollTop, setShowScrollTop] = useState(false);

    // 1. 内容预处理 (处理自定义语法)
    const contentWithSyntax = useMemo(() => {
        let text = content || "";

        // 匹配标签样式
        text = text.replace(/(\s|^)#([\w\u4e00-\u9fa5]+)/g, (_, p, t) => {
            return `${p}<span class="md-tag-inline">#${t}</span>`;
        });

        // 匹配自定义高亮语法
        text = text.replace(/\+\+(.*?)\+\+/g, '<span class="custom-underline-red">$1</span>')
            .replace(/\^\^(.*?)\^\^/g, '<span class="custom-underline-wavy">$1</span>')
            .replace(/==(.*?)==/g, '<span class="custom-watercolor">$1</span>');

        return text;
    }, [content]);

    // 2. 统计与标题提取
    useEffect(() => {
        const safeText = content || "";
        const textContent = safeText.replace(/[#*`>~-]/g, '');
        setStats({
            wordCount: textContent.trim().length,
            readTime: Math.ceil(textContent.trim().length / 400)
        });

        const lines = safeText.split('\n');
        const headerItems: HeaderItem[] = [];
        lines.forEach(line => {
            const match = line.match(/^(#{2,6})\s+(.*)$/);
            if (match) {
                headerItems.push({
                    text: match[2].replace(/[*_~`]/g, ''),
                    level: match[1].length,
                    slug: match[2].toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')
                });
            }
        });
        setHeaders(headerItems);
    }, [content]);

    // 3. 滚动监听
    useEffect(() => {
        const target = scrollContainerId ? document.getElementById(scrollContainerId) : window;

        const handleScroll = () => {
            const currentScrollTop = scrollContainerId
                ? (target as HTMLElement).scrollTop
                : (window.pageYOffset || document.documentElement.scrollTop);

            setShowScrollTop(currentScrollTop > 300);

            if (headers.length === 0) return;
            for (const header of headers) {
                const el = document.getElementById(header.slug);
                if (el && el.getBoundingClientRect().top < 150) {
                    setActiveHeader(header.slug);
                }
            }
        };

        target?.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();

        return () => target?.removeEventListener('scroll', handleScroll);
    }, [headers, scrollContainerId]);

    const handleScrollToTop = () => {
        if (scrollContainerId) {
            const container = document.getElementById(scrollContainerId);
            if (container) {
                container.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return {
        contentWithSyntax,
        headers,
        activeHeader,
        stats,
        showScrollTop,
        handleScrollToTop
    };
};