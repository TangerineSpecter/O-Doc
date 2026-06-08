// frontend_react/src/components/Article/MarkdownElements.tsx

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import mermaid from 'mermaid';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow as darkTheme } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy, AlertTriangle, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

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

  /* 5. Mermaid 缩放滑条 */
  .mermaid-zoom-slider {
    width: 132px;
    height: 16px;
    cursor: pointer;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
  }
  .mermaid-zoom-slider::-webkit-slider-runnable-track {
    height: 3px;
    border-radius: 999px;
    background: var(--mermaid-zoom-track, #e2e8f0);
  }
  .mermaid-zoom-slider::-webkit-slider-thumb {
    width: 12px;
    height: 12px;
    margin-top: -4.5px;
    border-radius: 999px;
    border: 2px solid #ffffff;
    background: #f97316;
    box-shadow: 0 1px 3px rgb(15 23 42 / 0.18);
    cursor: pointer;
    -webkit-appearance: none;
  }
  .mermaid-zoom-slider::-moz-range-track {
    height: 3px;
    border-radius: 999px;
    background: var(--mermaid-zoom-track, #e2e8f0);
  }
  .mermaid-zoom-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    border: 2px solid #ffffff;
    background: #f97316;
    box-shadow: 0 1px 3px rgb(15 23 42 / 0.18);
    cursor: pointer;
  }
`;

const MIN_MERMAID_SCALE = 1;
const MAX_MERMAID_SCALE = 3;
const MERMAID_SCALE_STEP = 0.1;

const clampMermaidScale = (value: number) => Math.min(MAX_MERMAID_SCALE, Math.max(MIN_MERMAID_SCALE, value));
const normalizeMermaidScale = (value: number) => Number(clampMermaidScale(value).toFixed(1));

// --- SVG Icons ---
export const ArticleIcons = {
    User: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
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
    const [scale, setScale] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDraggingChart, setIsDraggingChart] = useState(false);
    const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
    const chartContentRef = useRef<HTMLDivElement>(null);
    const chartDragRef = useRef({
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
    });

    const zoomOut = () => setScale(current => normalizeMermaidScale(current - MERMAID_SCALE_STEP));
    const zoomIn = () => setScale(current => normalizeMermaidScale(current + MERMAID_SCALE_STEP));
    const resetZoom = () => setScale(1);
    const updateScaleFromSlider = (event: React.ChangeEvent<HTMLInputElement>) => {
        setScale(normalizeMermaidScale(Number(event.target.value) / 100));
    };
    const handleChartWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        const direction = event.deltaY < 0 ? 1 : -1;
        setScale(current => normalizeMermaidScale(current + direction * MERMAID_SCALE_STEP));
    };
    const handleChartMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0 || scale <= MIN_MERMAID_SCALE) return;

        chartDragRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: event.currentTarget.scrollLeft,
            scrollTop: event.currentTarget.scrollTop,
        };
        setIsDraggingChart(true);
    };
    const handleChartMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!isDraggingChart) return;

        event.preventDefault();
        const dragState = chartDragRef.current;
        event.currentTarget.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.startX);
        event.currentTarget.scrollTop = dragState.scrollTop - (event.clientY - dragState.startY);
    };
    const stopChartDrag = () => setIsDraggingChart(false);

    useEffect(() => {
        if (!isFullscreen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsFullscreen(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen]);

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

    useLayoutEffect(() => {
        if (!svg) return;

        const svgElement = chartContentRef.current?.querySelector('svg');
        if (!svgElement) return;

        const measuredWidth = svgElement.getBoundingClientRect().width || svgElement.viewBox.baseVal.width;
        const measuredHeight = svgElement.getBoundingClientRect().height || svgElement.viewBox.baseVal.height;
        setChartSize({ width: measuredWidth, height: measuredHeight });
    }, [svg]);

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

    const controls = (fullscreen = false) => (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 p-1.5 shadow-sm">
            <button
                type="button"
                onClick={zoomOut}
                disabled={scale <= MIN_MERMAID_SCALE}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                title="缩小"
            >
                <ZoomOut className="w-4 h-4" />
            </button>
            <input
                type="range"
                min={MIN_MERMAID_SCALE * 100}
                max={MAX_MERMAID_SCALE * 100}
                step={MERMAID_SCALE_STEP * 100}
                value={Math.round(scale * 100)}
                onChange={updateScaleFromSlider}
                className="mermaid-zoom-slider"
                style={{
                    '--mermaid-zoom-track': `linear-gradient(to right, #f97316 0%, #f97316 ${((scale - MIN_MERMAID_SCALE) / (MAX_MERMAID_SCALE - MIN_MERMAID_SCALE)) * 100}%, #e2e8f0 ${((scale - MIN_MERMAID_SCALE) / (MAX_MERMAID_SCALE - MIN_MERMAID_SCALE)) * 100}%, #e2e8f0 100%)`,
                } as React.CSSProperties}
                aria-label="调整流程图缩放比例"
                title="拖动调整缩放"
            />
            <span className="min-w-12 text-center text-xs font-medium tabular-nums text-slate-500">
                {Math.round(scale * 100)}%
            </span>
            <button
                type="button"
                onClick={zoomIn}
                disabled={scale >= MAX_MERMAID_SCALE}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                title="放大"
            >
                <ZoomIn className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={resetZoom}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                title="还原"
            >
                <RotateCcw className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => setIsFullscreen(!fullscreen)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                title={fullscreen ? '退出全屏' : '全屏展示'}
            >
                {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
    );

    const chartBody = (fullscreen = false) => (
        <div
            className={`overflow-auto select-none ${scale > MIN_MERMAID_SCALE ? isDraggingChart ? 'cursor-grabbing' : 'cursor-grab' : ''} ${fullscreen ? 'h-full p-8 pt-16' : 'max-h-[70vh] p-6 pt-14'}`}
            onWheel={handleChartWheel}
            onMouseDown={handleChartMouseDown}
            onMouseMove={handleChartMouseMove}
            onMouseUp={stopChartDrag}
            onMouseLeave={stopChartDrag}
        >
            <div
                className="mx-auto"
                style={{
                    width: chartSize.width ? chartSize.width * scale : 'max-content',
                    height: chartSize.height ? chartSize.height * scale : 'auto',
                    minWidth: chartSize.width ? chartSize.width * scale : undefined,
                }}
            >
                <div
                    ref={chartContentRef}
                    className="inline-block [&_svg]:max-w-none"
                    style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            </div>
        </div>
    );

    return (
        <>
            <div className="not-prose relative my-8 w-full bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="absolute right-3 top-3 z-10">{controls()}</div>
                {!isFullscreen && chartBody()}
            </div>

            {isFullscreen && (
                <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-sm p-4">
                    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                        <div className="absolute right-4 top-4 z-10">{controls(true)}</div>
                        {chartBody(true)}
                    </div>
                </div>
            )}
        </>
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
