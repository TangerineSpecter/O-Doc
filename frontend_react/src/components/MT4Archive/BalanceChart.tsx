import { useId, useMemo, useState } from 'react';
import type { MT4Event } from '../../types/api/mt4Archive';
import { TrendingUp, TrendingDown, Layers } from 'lucide-react';
import {sampleLotEvents} from './chartSampling';

interface PointData {
    event: MT4Event;
    value: number;
    index: number;
}

export function BalanceChart({
    events,
    initialBalance,
    showLots = true,
}: {
    events: MT4Event[];
    initialBalance?: string;
    showLots?: boolean;
}) {
    const gradientId = useId();
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    // 筛选所有有平仓余额的记录
    const closes = useMemo(() => {
        return events
            .filter((event) => event.balance?.trim() && Number.isFinite(Number(event.balance)))
            .map((event) => ({ event, value: Number(event.balance) }));
    }, [events]);

    // 开仓订单（用于手数副图）
    const orderEvents = useMemo(() => {
        return events.filter(
            (e) =>
                ['buy', 'sell'].includes(e.type?.toLowerCase()) &&
                e.lots?.trim() &&
                Number.isFinite(Number(e.lots)) &&
                Number(e.lots) > 0,
        );
    }, [events]);

    const maxLot = useMemo(() => {
        return orderEvents.reduce((m, e) => Math.max(m, Number(e.lots)), 0);
    }, [orderEvents]);

    const sampledOrders = useMemo(() => sampleLotEvents(orderEvents), [orderEvents]);

    // 包含起始资金的数据序列
    const points: PointData[] = useMemo(() => {
        const rawPoints =
            closes.length && initialBalance?.trim() && Number.isFinite(Number(initialBalance))
                ? [
                      {
                          event: {
                              ...closes[0].event,
                              sequence: '0',
                              time: '回测开始',
                              order: '—',
                              profit: '0.00',
                              balance: initialBalance,
                          },
                          value: Number(initialBalance),
                      },
                      ...closes,
                  ]
                : closes;
        return rawPoints.map((item, idx) => ({ ...item, index: idx }));
    }, [closes, initialBalance]);

    const { min, max } = useMemo(() => {
        return points.reduce(
            (range, point) => ({
                min: Math.min(range.min, point.value),
                max: Math.max(range.max, point.value),
            }),
            { min: Infinity, max: -Infinity },
        );
    }, [points]);

    const span = max - min || 1;
    const startVal = points[0]?.value ?? 0;
    const endVal = points[points.length - 1]?.value ?? 0;
    const isProfit = endVal >= startVal;
    const totalDiff = endVal - startVal;
    const diffPercent = startVal > 0 ? (totalDiff / startVal) * 100 : 0;

    // 抽样算法：防止超大报告导致 SVG 卡顿，同时保留各区间的局部极值
    const sampledIndices = useMemo(() => {
        const bucketSize = Math.max(1, Math.ceil(points.length / 1200));
        const selected: number[] = [];
        for (let start = 0; start < points.length; start += bucketSize) {
            const end = Math.min(points.length, start + bucketSize);
            let low = start;
            let high = start;
            for (let i = start + 1; i < end; i++) {
                if (points[i].value < points[low].value) low = i;
                if (points[i].value > points[high].value) high = i;
            }
            for (const i of [...new Set([start, low, high, end - 1])].sort((a, b) => a - b)) {
                selected.push(i);
            }
        }
        return selected;
    }, [points]);

    // 查找最高点与最低点索引
    const peakIndex = useMemo(() => {
        let p = 0;
        for (let i = 1; i < points.length; i++) {
            if (points[i].value > points[p].value) p = i;
        }
        return p;
    }, [points]);

    const troughIndex = useMemo(() => {
        let t = 0;
        for (let i = 1; i < points.length; i++) {
            if (points[i].value < points[t].value) t = i;
        }
        return t;
    }, [points]);

    // SVG 尺寸定义
    const svgWidth = 860;
    const chartHeight = 180;
    const paddingLeft = 20;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 20;
    const usableWidth = svgWidth - paddingLeft - paddingRight;
    const usableHeight = chartHeight - paddingTop - paddingBottom;

    const getX = (index: number) => {
        if (points.length <= 1) return paddingLeft;
        return paddingLeft + (index * usableWidth) / (points.length - 1);
    };

    const getY = (val: number) => {
        return paddingTop + usableHeight - ((val - min) * usableHeight) / span;
    };

    // 折线点集与填充区域
    const polylinePoints = useMemo(() => {
        return sampledIndices.map((idx) => `${getX(idx).toFixed(1)},${getY(points[idx].value).toFixed(1)}`).join(' ');
    }, [sampledIndices, points, min, span]);

    const areaPath = useMemo(() => {
        if (!sampledIndices.length) return '';
        const firstX = getX(sampledIndices[0]).toFixed(1);
        const lastX = getX(sampledIndices[sampledIndices.length - 1]).toFixed(1);
        const bottomY = (paddingTop + usableHeight).toFixed(1);
        const linePath = sampledIndices
            .map((idx, i) => `${i === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(points[idx].value).toFixed(1)}`)
            .join(' ');
        return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
    }, [sampledIndices, points, min, span]);

    if (!closes.length) {
        return (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                <p className="text-sm font-medium text-slate-500">没有平仓余额数据，无法重建曲线</p>
                <p className="mt-1 text-xs text-slate-400">导入完整含有 Balance 变动的交易事件后将自动生成</p>
            </div>
        );
    }

    // 悬浮点数据
    const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

    // 鼠标在图表上移动计算当前对应的数据点
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const relativeX = (mouseX / rect.width) * svgWidth;
        const boundedX = Math.max(paddingLeft, Math.min(svgWidth - paddingRight, relativeX));
        const ratio = (boundedX - paddingLeft) / usableWidth;
        const targetIndex = Math.round(ratio * (points.length - 1));
        if (targetIndex >= 0 && targetIndex < points.length) {
            setHoverIndex(targetIndex);
        }
    };

    return (
        <div className="space-y-4">
            {/* 图表顶部统计信息栏 */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex items-center gap-2">
                    <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                            isProfit ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                    >
                        {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        净收益: {totalDiff >= 0 ? '+' : ''}
                        {totalDiff.toFixed(2)} ({diffPercent >= 0 ? '+' : ''}
                        {diffPercent.toFixed(2)}%)
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-600">
                        {points.length - 1} 笔平仓记录 {initialBalance ? `(起始: ${initialBalance})` : ''}
                    </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                    <div>
                        <span className="text-slate-400">最低: </span>
                        <span className="font-mono font-medium text-slate-700">{min.toFixed(2)}</span>
                    </div>
                    <div>
                        <span className="text-slate-400">最高: </span>
                        <span className="font-mono font-medium text-slate-700">{max.toFixed(2)}</span>
                    </div>
                    <div>
                        <span className="text-slate-400">期末: </span>
                        <span
                            className={`font-mono font-bold ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}
                        >
                            {endVal.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>

            {/* 主图表 SVG 区域 */}
            <div className="relative select-none">
                <svg
                    viewBox={`0 0 ${svgWidth} ${chartHeight}`}
                    className="h-52 w-full overflow-visible"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoverIndex(null)}
                    role="img"
                    aria-label="平仓余额变化曲线"
                >
                    <defs>
                        <linearGradient id={`${gradientId}-grad`} x1="0" y1="0" x2="0" y2="1">
                            <stop
                                offset="0%"
                                stopColor={isProfit ? '#10b981' : '#f97316'}
                                stopOpacity={0.28}
                            />
                            <stop
                                offset="100%"
                                stopColor={isProfit ? '#10b981' : '#f97316'}
                                stopOpacity={0.0}
                            />
                        </linearGradient>
                    </defs>

                    {/* 背景水平网格虚线 */}
                    {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                        const y = paddingTop + usableHeight * pct;
                        return (
                            <line
                                key={i}
                                x1={paddingLeft}
                                x2={svgWidth - paddingRight}
                                y1={y}
                                y2={y}
                                stroke="#f1f5f9"
                                strokeDasharray={i === 4 ? 'none' : '3 3'}
                                strokeWidth="1"
                            />
                        );
                    })}

                    {/* 渐变面积填充 */}
                    <path d={areaPath} fill={`url(#${gradientId}-grad)`} />

                    {/* 主折线 */}
                    <polyline
                        points={polylinePoints}
                        fill="none"
                        stroke={isProfit ? '#059669' : '#ea580c'}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                    />

                    {/* 最高点 & 最低点标注 */}
                    {points.length > 2 && (
                        <>
                            <circle
                                cx={getX(peakIndex)}
                                cy={getY(points[peakIndex].value)}
                                r="4"
                                fill="#10b981"
                                stroke="#ffffff"
                                strokeWidth="2"
                            />
                            <circle
                                cx={getX(troughIndex)}
                                cy={getY(points[troughIndex].value)}
                                r="4"
                                fill="#f43f5e"
                                stroke="#ffffff"
                                strokeWidth="2"
                            />
                        </>
                    )}

                    {/* 终点高亮发光小圆点 */}
                    {points.length > 0 && (
                        <circle
                            cx={getX(points.length - 1)}
                            cy={getY(endVal)}
                            r="4.5"
                            fill={isProfit ? '#059669' : '#ea580c'}
                            stroke="#ffffff"
                            strokeWidth="2.5"
                        />
                    )}

                    {/* 鼠标悬浮指示光标与高亮圆点 */}
                    {activePoint && (
                        <>
                            <line
                                x1={getX(activePoint.index)}
                                x2={getX(activePoint.index)}
                                y1={paddingTop}
                                y2={paddingTop + usableHeight}
                                stroke="#94a3b8"
                                strokeWidth="1"
                                strokeDasharray="2 2"
                            />
                            <circle
                                cx={getX(activePoint.index)}
                                cy={getY(activePoint.value)}
                                r="5"
                                fill="#ffffff"
                                stroke="#0f172a"
                                strokeWidth="2.5"
                            />
                        </>
                    )}
                </svg>

                {/* 悬浮交互 Tooltip 气泡 */}
                {activePoint && (
                    <div
                        className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur text-xs"
                        style={{
                            left: `${(getX(activePoint.index) / svgWidth) * 100}%`,
                        }}
                    >
                        <div className="flex items-center gap-2 font-mono font-bold text-slate-800">
                            <span>余额: {activePoint.value.toFixed(2)}</span>
                            {activePoint.event.profit && (
                                <span
                                    className={
                                        Number(activePoint.event.profit) >= 0
                                            ? 'text-emerald-600'
                                            : 'text-rose-600'
                                    }
                                >
                                    ({Number(activePoint.event.profit) >= 0 ? '+' : ''}
                                    {Number(activePoint.event.profit).toFixed(2)})
                                </span>
                            )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-slate-500">
                            <span>{activePoint.event.time || '—'}</span>
                            {activePoint.event.order && activePoint.event.order !== '—' && (
                                <span>#单号 {activePoint.event.order}</span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 开仓手数副图柱状分布 */}
            {showLots && orderEvents.length > 0 && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                            <Layers size={13} className="text-lime-600" />
                            开仓手数分布 · {orderEvents.length} 次{sampledOrders.length < orderEvents.length ? '（抽样显示）' : ''}
                        </span>
                        <span>最大开仓手数: <strong className="font-mono text-slate-800">{maxLot}</strong> 手</span>
                    </div>
                    <svg
                        viewBox={`0 0 ${svgWidth} 48`}
                        className="h-12 w-full"
                        role="img"
                        aria-label="开仓手数分布图"
                    >
                        <line
                            x1={paddingLeft}
                            x2={svgWidth - paddingRight}
                            y1="46"
                            y2="46"
                            stroke="#e2e8f0"
                        />
                        {sampledOrders.map(({event: evt, index: i}) => {
                            const barHeight = maxLot > 0 ? (Number(evt.lots) / maxLot) * 40 : 0;
                            const x =
                                paddingLeft +
                                (i * usableWidth) / Math.max(orderEvents.length - 1, 1);
                            const width = Math.max(
                                1,
                                Math.min(6, usableWidth / (sampledOrders.length * 1.3)),
                            );
                            const isBuy = evt.type?.toLowerCase() === 'buy';
                            return (
                                <rect
                                    key={`${evt.sequence}-${i}`}
                                    x={x}
                                    y={46 - barHeight}
                                    width={width}
                                    height={Math.max(barHeight, 1.5)}
                                    rx="0.5"
                                    fill={isBuy ? '#10b981' : '#f59e0b'}
                                    opacity="0.85"
                                >
                                    <title>{`${evt.time} · ${evt.type?.toUpperCase()} · ${evt.lots} 手 · 价格 ${evt.price}`}</title>
                                </rect>
                            );
                        })}
                    </svg>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" /> 多单 Buy
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-amber-500" /> 空单 Sell
                            </span>
                        </span>
                        <span>柱高代表单笔开仓规模</span>
                    </div>
                </div>
            )}
        </div>
    );
}
