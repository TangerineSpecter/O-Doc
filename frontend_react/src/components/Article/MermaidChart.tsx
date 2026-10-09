import React, {useEffect, useRef, useState} from 'react';
import mermaid from 'mermaid';
import {AlertTriangle, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut} from 'lucide-react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {useMermaidViewport, MIN_MERMAID_SCALE, MAX_MERMAID_SCALE, MERMAID_SCALE_STEP, normalizeMermaidScale} from '../../hooks/useMermaidViewport';

export const MermaidChart = ({ chart }: { chart: string }) => {
    const [svg, setSvg] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [isFullscreen, setIsFullscreen] = useState(false);
    useEscapeDismissal(isFullscreen, () => setIsFullscreen(false));
    const [isDraggingChart, setIsDraggingChart] = useState(false);
    const {scale, setScale, chartSize, chartContentRef, viewportRef, resetZoom} = useMermaidViewport(svg, isFullscreen);
    const chartDragRef = useRef({
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
    });

    const zoomOut = () => setScale(current => normalizeMermaidScale(current - MERMAID_SCALE_STEP));
    const zoomIn = () => setScale(current => normalizeMermaidScale(current + MERMAID_SCALE_STEP));
    const updateScaleFromSlider = (event: React.ChangeEvent<HTMLInputElement>) => {
        setScale(normalizeMermaidScale(Number(event.target.value) / 100));
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

    const controls = (fullscreen = false) => (
        <div className="flex items-center justify-end gap-1 sm:gap-2">
            <button
                type="button"
                onClick={zoomOut}
                disabled={scale <= MIN_MERMAID_SCALE}
                className="p-2.5 sm:p-1.5 shrink-0 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                title="缩小" aria-label="缩小流程图"
            >
                <ZoomOut className="w-4 h-4" />
            </button>
            <input
                type="range"
                min={MIN_MERMAID_SCALE * 100}
                max={MAX_MERMAID_SCALE * 100}
                step={1}
                value={Math.round(scale * 100)}
                onChange={updateScaleFromSlider}
                className="mermaid-zoom-slider hidden sm:block"
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
                className="p-2.5 sm:p-1.5 shrink-0 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                title="放大" aria-label="放大流程图"
            >
                <ZoomIn className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={resetZoom}
                className="p-2.5 sm:p-1.5 shrink-0 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                title="恢复自适应大小" aria-label="恢复自适应大小"
            >
                <RotateCcw className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => setIsFullscreen(!fullscreen)}
                className="p-2.5 sm:p-1.5 shrink-0 rounded-md text-slate-500 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                title={fullscreen ? '退出全屏' : '全屏展示'} aria-label={fullscreen ? '退出全屏' : '全屏展示'}
            >
                {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
    );

    const chartBody = (fullscreen = false) => (
        <div
            ref={viewportRef}
            className={`overflow-auto scrollbar-hide select-none ${isDraggingChart ? 'cursor-grabbing' : 'cursor-grab'} ${fullscreen ? 'min-h-0 flex-1 p-4 sm:p-8' : 'max-h-[70vh] p-4 sm:p-6'}`}
            onMouseDown={handleChartMouseDown}
            onMouseMove={handleChartMouseMove}
            onMouseUp={stopChartDrag}
            onMouseLeave={stopChartDrag}
        >
            <div
                className="mx-auto overflow-hidden"
                style={{
                    width: chartSize.width ? chartSize.width * scale : 'max-content',
                    height: chartSize.height ? chartSize.height * scale : 'auto',
                    minWidth: chartSize.width ? chartSize.width * scale : undefined,
                }}
            >
                <div
                    ref={chartContentRef}
                    className="block [&_svg]:max-w-none"
                    style={{width: chartSize.width || undefined, height: chartSize.height || undefined, transform: `scale(${scale})`, transformOrigin: 'top left'}}
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            </div>
        </div>
    );

    return (
        <>
            <div className="not-prose relative my-8 w-full bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {!isFullscreen && chartBody()}
                <div className="border-t border-slate-100 px-3 py-1.5">{controls()}</div>
            </div>

            {isFullscreen && (
                <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-sm p-4">
                    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                        {chartBody(true)}
                        <div className="shrink-0 border-t border-slate-100 px-3 py-1.5">{controls(true)}</div>
                    </div>
                </div>
            )}
        </>
    );
};

