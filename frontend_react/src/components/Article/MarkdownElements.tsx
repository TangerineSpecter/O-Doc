// frontend_react/src/components/Article/MarkdownElements.tsx

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import mermaid from 'mermaid';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow as darkTheme } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy, AlertTriangle, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import {
    Bar,
    BarChart as ReBarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart as ReLineChart,
    Pie,
    PieChart as RePieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

// --- 强制样式 ---
export const CUSTOM_STYLES = `
  /* 1. 隐藏行内代码的反引号 */
  .prose :where(code):not(:where([class~="not-prose"] *))::before { content: none !important; }
  .prose :where(code):not(:where([class~="not-prose"] *))::after { content: none !important; }
  .article-inline-code {
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    word-break: break-word;
  }
  .prose table .article-inline-code {
    white-space: nowrap;
    word-break: normal;
  }

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
const CHART_COLORS = ['#f97316', '#0ea5e9', '#84cc16', '#ec4899', '#8b5cf6', '#14b8a6', '#f59e0b', '#64748b'];

const clampMermaidScale = (value: number) => Math.min(MAX_MERMAID_SCALE, Math.max(MIN_MERMAID_SCALE, value));
const normalizeMermaidScale = (value: number) => Number(clampMermaidScale(value).toFixed(1));

type SimpleChartType = 'line' | 'bar' | 'pie' | 'wordcloud';

interface SimpleChartDataPoint {
    name: string;
    value: number;
}

interface ParsedSimpleChart {
    type: SimpleChartType;
    title: string;
    data: SimpleChartDataPoint[];
    error?: string;
}

const normalizeSimpleChartType = (value: string): SimpleChartType | null => {
    const normalized = value.trim().toLowerCase();
    if (['line', '折线', '折线图'].includes(normalized)) return 'line';
    if (['bar', '柱状', '柱状图', 'bar chart'].includes(normalized)) return 'bar';
    if (['pie', '饼图', 'pie chart'].includes(normalized)) return 'pie';
    if (['wordcloud', 'word cloud', '词云', '词云图'].includes(normalized)) return 'wordcloud';
    return null;
};

const parseNumberValue = (value: string) => {
    const normalized = value.trim().replace(/,/g, '');
    if (!normalized) return Number.NaN;
    return Number(normalized);
};

const parseSimpleChart = (source: string): ParsedSimpleChart => {
    const lines = source
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    let type: SimpleChartType = 'bar';
    let title = '简单图表';
    const dataLines: string[] = [];

    lines.forEach(line => {
        const optionMatch = line.match(/^([a-zA-Z\u4e00-\u9fa5]+)\s*[:：]\s*(.+)$/);
        if (optionMatch) {
            const key = optionMatch[1].trim().toLowerCase();
            const value = optionMatch[2].trim();

            if (['type', '类型'].includes(key)) {
                type = normalizeSimpleChartType(value) || type;
                return;
            }

            if (['title', '标题'].includes(key)) {
                title = value || title;
                return;
            }
        }

        dataLines.push(line);
    });

    const rows = dataLines
        .map(line => line.split(/[,，\t|]/).map(cell => cell.trim()))
        .filter(cells => cells.length >= 2);

    const data = rows
        .filter((cells, index) => {
            if (index !== 0) return true;
            return Number.isFinite(parseNumberValue(cells[1]));
        })
        .map(cells => ({
            name: cells[0],
            value: parseNumberValue(cells[1]),
        }))
        .filter(item => item.name && Number.isFinite(item.value));

    if (data.length === 0) {
        return {
            type,
            title,
            data,
            error: '图表数据为空或格式不正确',
        };
    }

    return {type, title, data};
};

const simpleChartTypeLabel: Record<SimpleChartType, string> = {
    line: '折线图',
    bar: '柱状图',
    pie: '饼图',
    wordcloud: '词云',
};

interface WordCloudLayoutItem extends SimpleChartDataPoint {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    color: string;
    weight: number;
    rotate: number;
}

const estimateWordWidth = (word: string, fontSize: number) => {
    const visualLength = Array.from(word).reduce((total, char) => total + (/[\u4e00-\u9fa5]/.test(char) ? 1 : 0.58), 0);
    return visualLength * fontSize + 18;
};

const hasWordCollision = (item: WordCloudLayoutItem, placed: WordCloudLayoutItem[]) => {
    const gap = 8;
    return placed.some(other => {
        return !(
            item.x + item.width / 2 + gap < other.x - other.width / 2 ||
            item.x - item.width / 2 - gap > other.x + other.width / 2 ||
            item.y + item.height / 2 + gap < other.y - other.height / 2 ||
            item.y - item.height / 2 - gap > other.y + other.height / 2
        );
    });
};

const buildWordCloudItems = (data: SimpleChartDataPoint[], width: number, height: number) => {
    const values = data.map(item => item.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const sortedData = [...data].sort((a, b) => b.value - a.value);
    const placed: WordCloudLayoutItem[] = [];
    const centerX = width / 2;
    const centerY = height / 2;

    sortedData.forEach((item, index) => {
        const ratio = (item.value - min) / range;
        const fontSize = Math.round(14 + ratio * 30);
        const rotate = index % 7 === 2 ? -10 : index % 7 === 5 ? 8 : 0;
        const wordWidth = estimateWordWidth(item.name, fontSize);
        const wordHeight = fontSize * 1.25 + 10;
        const maxAttempts = 1500;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const angle = attempt * 0.34;
            const radius = 2.8 * Math.sqrt(attempt) + attempt * 0.12;
            const candidate: WordCloudLayoutItem = {
                ...item,
                x: centerX + Math.cos(angle) * radius * 1.45,
                y: centerY + Math.sin(angle) * radius,
                width: wordWidth,
                height: wordHeight,
                fontSize,
                color: CHART_COLORS[index % CHART_COLORS.length],
                weight: ratio > 0.65 ? 800 : ratio > 0.35 ? 700 : 600,
                rotate,
            };

            const inBounds = candidate.x - candidate.width / 2 >= 10
                && candidate.x + candidate.width / 2 <= width - 10
                && candidate.y - candidate.height / 2 >= 10
                && candidate.y + candidate.height / 2 <= height - 10;

            if (inBounds && !hasWordCollision(candidate, placed)) {
                placed.push(candidate);
                return;
            }
        }
    });

    return placed.map(item => ({
            ...item,
            left: (item.x / width) * 100,
            top: (item.y / height) * 100,
        }));
};

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

export const SimpleChart = ({ chart }: { chart: string }) => {
    const parsed = parseSimpleChart(chart);
    const [activeWord, setActiveWord] = useState<SimpleChartDataPoint | null>(null);
    const [isWordCloudFullscreen, setIsWordCloudFullscreen] = useState(false);

    if (parsed.error) {
        return (
            <div className="not-prose my-6 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-bold">图表渲染失败</p>
                        <p className="mt-1 text-xs text-amber-700/80">{parsed.error}</p>
                        <p className="mt-2 text-xs text-amber-700/80">
                            支持 type: bar / line / pie / wordcloud；数据使用“名称,数值”，每行一条。
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const renderWordCloud = (fullscreen = false) => {
        const canvas = fullscreen ? {width: 1680, height: 860} : {width: 1180, height: 360};
        const words = buildWordCloudItems(parsed.data, canvas.width, canvas.height);

        return (
            <div className={`relative h-full w-full overflow-hidden rounded-lg bg-gradient-to-br from-orange-50/70 via-white to-sky-50/80 ${fullscreen ? 'p-5' : ''}`}>
                {activeWord && (
                    <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-lg shadow-slate-900/10">
                        <span className="font-semibold text-slate-900">{activeWord.name}</span>
                        <span className="mx-1 text-slate-400">·</span>
                        <span>{activeWord.value}</span>
                    </div>
                )}
                {!fullscreen && (
                    <button
                        type="button"
                        onClick={() => setIsWordCloudFullscreen(true)}
                        className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-orange-50 hover:text-orange-600"
                        title="全屏查看词云"
                    >
                        <Maximize2 className="h-3.5 w-3.5" />
                        全屏
                    </button>
                )}
                {words.length < parsed.data.length && (
                    <div className="absolute bottom-4 right-4 z-20 rounded-lg border border-orange-100 bg-white/95 px-3 py-2 text-xs text-slate-500 shadow-sm">
                        已显示 {words.length} / {parsed.data.length}
                    </div>
                )}
                <div className="relative h-full w-full">
                    {words.map(word => (
                        <span
                            key={word.name}
                            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-default whitespace-nowrap rounded-md px-1.5 py-1 leading-none transition-all hover:z-10 hover:-translate-y-[55%] hover:bg-white/85 hover:shadow-sm"
                            style={{
                                left: `${word.left}%`,
                                top: `${word.top}%`,
                                color: word.color,
                                fontSize: word.fontSize,
                                fontWeight: word.weight,
                                transform: `translate(-50%, -50%) rotate(${word.rotate}deg)`,
                            }}
                            onMouseEnter={() => setActiveWord({name: word.name, value: word.value})}
                            onMouseLeave={() => setActiveWord(null)}
                        >
                            {word.name}
                        </span>
                    ))}
                </div>
            </div>
        );
    };

    const renderChart = () => {
        if (parsed.type === 'wordcloud') {
            return renderWordCloud(false);
        }

        if (parsed.type === 'line') {
            return (
                <ReLineChart data={parsed.data} margin={{top: 12, right: 20, bottom: 4, left: 0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} tickLine={false} axisLine={{stroke: '#cbd5e1'}} />
                    <YAxis tick={{fill: '#64748b', fontSize: 12}} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" name="数值" stroke="#f97316" strokeWidth={3} dot={{r: 4, fill: '#ffffff', strokeWidth: 2}} activeDot={{r: 6}} />
                </ReLineChart>
            );
        }

        if (parsed.type === 'pie') {
            return (
                <RePieChart margin={{top: 6, right: 8, bottom: 6, left: 8}}>
                    <Pie
                        data={parsed.data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="45%"
                        outerRadius="72%"
                        paddingAngle={2}
                        label={({name, percent}) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                        {parsed.data.map((entry, index) => (
                            <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{fontSize: 12}} />
                </RePieChart>
            );
        }

        return (
            <ReBarChart data={parsed.data} margin={{top: 12, right: 20, bottom: 4, left: 0}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} tickLine={false} axisLine={{stroke: '#cbd5e1'}} />
                <YAxis tick={{fill: '#64748b', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="value" name="数值" radius={[8, 8, 0, 0]}>
                    {parsed.data.map((entry, index) => (
                        <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                </Bar>
            </ReBarChart>
        );
    };

    return (
        <>
            <div className="not-prose my-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">{parsed.title}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">{simpleChartTypeLabel[parsed.type]} · {parsed.data.length} 项数据</p>
                    </div>
                </div>
                <div className="h-80 w-full p-4">
                    {parsed.type === 'wordcloud' ? renderChart() : (
                        <ResponsiveContainer width="100%" height="100%">
                            {renderChart()}
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {isWordCloudFullscreen && parsed.type === 'wordcloud' && (
                <div className="fixed inset-0 z-[200] bg-slate-950/80 p-4 backdrop-blur-sm">
                    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                        <div className="absolute left-5 top-5 z-30">
                            <h3 className="text-base font-bold text-slate-900">{parsed.title}</h3>
                            <p className="mt-0.5 text-xs text-slate-500">词云 · {parsed.data.length} 项数据</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setIsWordCloudFullscreen(false);
                                setActiveWord(null);
                            }}
                            className="absolute right-5 top-5 z-30 rounded-lg border border-slate-200 bg-white/95 p-2 text-slate-500 shadow-sm transition-colors hover:bg-orange-50 hover:text-orange-600"
                            title="退出全屏"
                        >
                            <Minimize2 className="h-4 w-4" />
                        </button>
                        <div className="h-full w-full p-16 pt-20">
                            {renderWordCloud(true)}
                        </div>
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
