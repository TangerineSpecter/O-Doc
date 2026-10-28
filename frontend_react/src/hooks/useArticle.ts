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
        text = text.replace(/(\s|^)#(?![0-9a-fA-F]{3,8}\b)([\w\u4e00-\u9fa5]+)/g, (_, p, t) => {
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

        const updateOnScroll = () => {
            const currentScrollTop = scrollContainerId
                ? (target as HTMLElement).scrollTop
                : (window.pageYOffset || document.documentElement.scrollTop);

            setShowScrollTop(currentScrollTop > 300);

            if (headers.length === 0) return;
            // 从后往前找第一个已越过的标题，命中即停，避免每个滚动事件遍历全部标题并反复触发布局。
            for (let index = headers.length - 1; index >= 0; index -= 1) {
                const el = document.getElementById(headers[index].slug);
                if (el && el.getBoundingClientRect().top < 150) {
                    setActiveHeader(headers[index].slug);
                    return;
                }
            }
        };

        // 滚动事件按帧合并，避免长文中连续 getBoundingClientRect 造成同步重排。
        let frame = 0;
        const handleScroll = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                updateOnScroll();
            });
        };

        target?.addEventListener('scroll', handleScroll, { passive: true });
        updateOnScroll();

        return () => {
            target?.removeEventListener('scroll', handleScroll);
            if (frame) window.cancelAnimationFrame(frame);
        };
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
