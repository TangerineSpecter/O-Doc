// frontend_react/src/components/Article/MarkdownElements.tsx

import React, { useState, useEffect } from 'react';
import mermaid from 'mermaid';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow as darkTheme } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy, AlertTriangle } from 'lucide-react';

// --- 强制样式 ---
export const CUSTOM_STYLES = `
  /* 1. 隐藏行内代码的反引号 */
  .prose :where(code):not(:where([class~="not-prose"] *))::before { content: none !important; }
  .prose :where(code):not(:where([class~="not-prose"] *))::after { content: none !important; }

  /* 2. 确保公式过长时可以内部滚动，而不是撑开页面 */
  .katex-display { overflow-x: auto; overflow-y: hidden; max-width: 100%; }

  /* 3. 自定义高亮特效 */
  .custom-underline-red { text-decoration: underline; text-decoration-color: #FF5582A6; text-decoration-thickness: 7px; text-underline-offset: -3px; }
  .custom-underline-wavy { text-decoration: underline; text-decoration-style: wavy; text-decoration-color: #0ea5e9; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .custom-watercolor { background: linear-gradient(120deg, #fef08a 0%, #fde047 100%); padding: 0.1em 0.3em; border-radius: 0.2em; color: #854d0e; }

  /* 4. 内联标签 */
  .md-tag-inline {
    display: inline-flex; align-items: center; padding: 0 0.4em; margin: 0 0.2em;
    border-radius: 0.25rem; font-size: 0.85em; font-weight: 500;
    color: #4f46e5; background-color: #eef2ff; border: 1px solid #e0e7ff;
  }
`;

// --- SVG Icons ---
export const ArticleIcons = {
    Tag: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><path d="M7 7h.01" /></svg>,
    Clock: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    Calendar: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    FileText: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>,
    ArrowUp: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m18 15-6-6-6 6" /></svg>,
    ArrowLeft: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
};

// --- Copy Button ---
export const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="text-slate-400 hover:text-white transition-colors p-1" title="Copy code">
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
    );
};

// --- Mermaid Component (Fixed) ---
export const MermaidChart = ({ chart }: { chart: string }) => {
    const [svg, setSvg] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const cleanChart = chart.trim();

        if (!cleanChart) return;

        // 初始化 Mermaid
        mermaid.initialize({
            startOnLoad: false,
            theme: 'neutral',
            securityLevel: 'loose',
            fontFamily: 'Inter, sans-serif',
            // 关键修复：禁止 Mermaid 自动生成错误 SVG，强制抛出异常
            suppressErrorRendering: true,
        });

        const render = async () => {
            try {
                // 1. 预检查语法（可选，但推荐）
                await mermaid.parse(cleanChart);

                // 2. 生成唯一 ID
                // 使用时间戳+随机数确保 React Strict Mode 下多次渲染 ID 不冲突
                const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;

                // 3. 渲染
                const { svg } = await mermaid.render(id, cleanChart);

                if (isMounted) {
                    setSvg(svg);
                    setError(null);
                }
            } catch (err: any) {
                console.warn("Mermaid Render Warning:", err);
                if (isMounted) {
                    // 只有在真的解析失败时才显示错误状态，而不是显示 Mermaid 的默认错误图
                    setError('Diagram syntax error');
                }
            }
        };

        render();

        return () => {
            isMounted = false;
        };
    }, [chart]);

    // 错误状态展示（比默认的 SVG 好看）
    if (error) {
        return (
            <div className="my-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1 overflow-hidden">
                    <p className="font-bold mb-1">流程图渲染失败</p>
                    <p className="opacity-80 text-xs mb-2">可能是语法错误或内容不完整</p>
                    <details className="cursor-pointer">
                        <summary className="text-xs hover:underline opacity-60">查看源码</summary>
                        <pre className="mt-2 p-2 bg-red-100/50 rounded text-[10px] font-mono whitespace-pre-wrap break-all">
                            {chart}
                        </pre>
                    </details>
                </div>
            </div>
        );
    }

    return (
        <div className="my-8 w-full bg-white border border-slate-200 rounded-xl shadow-sm p-6 overflow-x-auto flex justify-center">
            <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
    );
};

// --- Code Block Component ---
export const CodeBlock = ({ language, code, ...rest }: any) => {
    return (
        <div className="code-block-wrapper my-6 rounded-xl overflow-hidden bg-[#1e293b] shadow-2xl border border-slate-700/50 text-[15px]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#0f172a] border-b border-slate-700/50">
                <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-[#ff5f56]" /><div className="w-3 h-3 rounded-full bg-[#ffbd2e]" /><div className="w-3 h-3 rounded-full bg-[#27c93f]" /></div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400 uppercase">{language}</span>
                    <CopyButton text={code} />
                </div>
            </div>
            <SyntaxHighlighter
                style={darkTheme}
                language={language}
                PreTag="div"
                customStyle={{ margin: 0, background: 'transparent' }}
                {...rest}
            >
                {code}
            </SyntaxHighlighter>
        </div>
    );
};