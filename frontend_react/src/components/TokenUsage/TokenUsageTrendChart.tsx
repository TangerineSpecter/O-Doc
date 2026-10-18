import {useMemo, useState} from 'react';
import {BarChart3} from 'lucide-react';
import {Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {TokenSummary} from '../../types/api/tokenUsage';
import {tokenNumber} from '../../utils/tokenUsage';

type ChartType = 'bar' | 'line';
type ChartPoint = {day: string; hour: string; totalTokens: number; largeModelTokens: number; decisionModelTokens: number};

function formatCompactTokenCount(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    return tokenNumber(Math.round(value));
}

function TotalTokenLabelList({showLargeModel, showDecisionModel}: {showLargeModel: boolean; showDecisionModel: boolean}) {
    return (
        <LabelList
            position="top"
            offset={5}
            fill="#64748b"
            fontSize={10}
            fontWeight={500}
            valueAccessor={entry => {
                const point = entry.payload as ChartPoint | undefined;
                if (!point) return undefined;
                const visibleTotal = (showLargeModel ? point.largeModelTokens : 0) + (showDecisionModel ? point.decisionModelTokens : 0);
                return visibleTotal ? formatCompactTokenCount(visibleTotal) : undefined;
            }}
        />
    );
}

function ModelToggle({
    label,
    colorClass,
    visible,
    onClick,
}: {
    label: string;
    colorClass: string;
    visible: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={`${visible ? '隐藏' : '显示'}${label}用量`}
            aria-pressed={visible}
            onClick={onClick}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                visible ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 line-through hover:bg-slate-100'
            }`}
        >
            <i aria-hidden="true" className={`h-2 w-2 rounded-sm ${colorClass} ${visible ? '' : 'opacity-30'}`} />
            {label}
        </button>
    );
}

function ChartTooltip({
    active,
    point,
    label,
    showHourly,
    showLargeModel,
    showDecisionModel,
}: {
    active?: boolean;
    point?: ChartPoint;
    label?: string | number;
    showHourly: boolean;
    showLargeModel: boolean;
    showDecisionModel: boolean;
}) {
    if (!active || !point) return null;
    const axisLabel = label == null ? '' : String(label);

    return (
        <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur-xs">
            <p className="text-[11px] font-semibold text-slate-600">
                {showHourly ? `${axisLabel}:00` : axisLabel}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-700">全部用量 {formatCompactTokenCount(point.totalTokens)} token</p>
            {showLargeModel && <p className="mt-1 text-[11px] text-orange-600">大模型 {formatCompactTokenCount(point.largeModelTokens)} token</p>}
            {showDecisionModel && <p className="text-[11px] text-violet-600">决策 {formatCompactTokenCount(point.decisionModelTokens)} token</p>}
        </div>
    );
}

export default function TokenUsageTrendChart({summary, showHourly}: {summary: TokenSummary; showHourly: boolean}) {
    const [chartType, setChartType] = useState<ChartType>('bar');
    const [showLargeModel, setShowLargeModel] = useState(true);
    const [showDecisionModel, setShowDecisionModel] = useState(true);

    const chartData = useMemo<ChartPoint[]>(() => {
        if (!showHourly) {
            return summary.days.map(item => ({
                day: item.day,
                hour: '',
                totalTokens: item.totalTokens,
                largeModelTokens: item.largeModelTokens,
                decisionModelTokens: item.decisionModelTokens,
            }));
        }

        const byHour = new Map((summary.hours || []).map(item => [item.hour, item]));
        return Array.from({length: 24}, (_, hour) => {
            const key = String(hour).padStart(2, '0');
            const item = byHour.get(key);
            return {
                day: key,
                hour: key,
                totalTokens: item?.totalTokens || 0,
                largeModelTokens: item?.largeModelTokens || 0,
                decisionModelTokens: item?.decisionModelTokens || 0,
            };
        });
    }, [summary, showHourly]);

    const peakDay = summary.days.length
        ? summary.days.reduce((max, day) => (day.totalTokens > max.totalTokens ? day : max), summary.days[0])
        : null;
    const modelTotal = summary.largeModelTokens + summary.decisionModelTokens;
    const largeModelPercent = modelTotal > 0 ? (summary.largeModelTokens / modelTotal) * 100 : 0;
    const decisionModelPercent = modelTotal > 0 ? (summary.decisionModelTokens / modelTotal) * 100 : 0;
    const hasVisibleModel = showLargeModel || showDecisionModel;
    const averageTokens = chartData.length
        ? chartData.reduce(
              (total, point) =>
                  total + (showLargeModel ? point.largeModelTokens : 0) + (showDecisionModel ? point.decisionModelTokens : 0),
              0
          ) / chartData.length
        : 0;
    const averageLine = hasVisibleModel && averageTokens > 0 ? (
        <ReferenceLine
            y={averageTokens}
            stroke="#64748b"
            strokeDasharray="6 4"
            strokeWidth={1.5}
            ifOverflow="extendDomain"
            label={{
                value: `平均 ${formatCompactTokenCount(averageTokens)} token`,
                position: 'insideTopRight',
                fill: '#64748b',
                fontSize: 11,
                offset: 8,
            }}
        />
    ) : null;

    const chartMargin = {left: -8, right: 12, top: 10, bottom: 0};
    const xAxisDataKey = showHourly ? 'hour' : 'day';
    const chartYAxis = (
        <YAxis
            width={48}
            tick={{fontSize: 10, fill: '#64748b'}}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
                value >= 1000000
                    ? formatCompactTokenCount(value)
                    : value >= 1000
                      ? `${Math.round(value / 1000)}k`
                      : String(value)
            }
        />
    );

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
            <div className="mb-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="rounded-md bg-orange-50 p-1 text-orange-600" aria-hidden="true">
                            <BarChart3 className="h-3.5 w-3.5" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-800">
                            {showHourly ? '每小时消耗趋势' : '每日消耗趋势'}
                        </h3>
                        <span className="text-xs text-slate-400">
                            {showHourly ? '(24 小时)' : `(${summary.days.length} 天记录)`}
                        </span>
                    </div>

                    <div role="group" aria-label="图表类型" className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-100/90 p-0.5">
                        {([
                            ['bar', '柱状图'],
                            ['line', '曲线图'],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={chartType === value}
                                onClick={() => setChartType(value)}
                                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                                    chartType === value
                                        ? 'bg-white text-orange-600 shadow-xs'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div role="group" aria-label="显示或隐藏图表类型" className="inline-flex items-center gap-1">
                        <ModelToggle
                            label="大模型"
                            colorClass="bg-orange-500"
                            visible={showLargeModel}
                            onClick={() => setShowLargeModel(visible => !visible)}
                        />
                        <ModelToggle
                            label="决策"
                            colorClass="bg-violet-500"
                            visible={showDecisionModel}
                            onClick={() => setShowDecisionModel(visible => !visible)}
                        />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs text-slate-500">
                        <div
                            className="w-64 max-w-full sm:w-80 lg:w-96"
                            title="大模型和决策模型在当前筛选范围已分类 Token 中的占比"
                        >
                            <div
                                role="img"
                                aria-label={`当前筛选范围占比：大模型 ${largeModelPercent.toFixed(1)}%，${formatCompactTokenCount(summary.largeModelTokens)} token；决策 ${decisionModelPercent.toFixed(1)}%，${formatCompactTokenCount(summary.decisionModelTokens)} token`}
                                className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100"
                            >
                                <span aria-hidden="true" className="h-full bg-orange-500 transition-[width]" style={{width: `${largeModelPercent}%`}} />
                                <span aria-hidden="true" className="h-full bg-violet-500 transition-[width]" style={{width: `${decisionModelPercent}%`}} />
                            </div>
                            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-4 tabular-nums text-slate-500">
                                <span className="whitespace-nowrap text-orange-600">
                                    大模型 {largeModelPercent.toFixed(1)}% · {formatCompactTokenCount(summary.largeModelTokens)} token
                                </span>
                                <span className="whitespace-nowrap text-violet-600">
                                    决策 {decisionModelPercent.toFixed(1)}% · {formatCompactTokenCount(summary.decisionModelTokens)} token
                                </span>
                            </p>
                        </div>
                        {showHourly ? (
                            <div className="whitespace-nowrap">
                                当日累计：
                                <strong className="font-semibold text-orange-600">{formatCompactTokenCount(summary.totalTokens)}</strong>{' '}
                                token
                            </div>
                        ) : peakDay ? (
                            <div className="whitespace-nowrap">
                                单日峰值：
                                <strong className="font-semibold text-orange-600">{formatCompactTokenCount(peakDay.totalTokens)}</strong>{' '}
                                ({peakDay.day.slice(5)})
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {chartData.length ? (
                <div className="h-44 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                        {chartType === 'bar' ? (
                            <BarChart data={chartData} margin={chartMargin}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey={xAxisDataKey}
                                    interval={showHourly ? 2 : 0}
                                    tick={{fontSize: 10, fill: '#64748b'}}
                                    tickLine={false}
                                    axisLine={{stroke: '#e2e8f0'}}
                                    tickFormatter={(value: string) => showHourly ? `${value}:00` : value.slice(5)}
                                />
                                {chartYAxis}
                                <Tooltip
                                    cursor={{fill: '#ffedd5', opacity: 0.4, radius: 6}}
                                    content={({active, payload, label}) => (
                                        <ChartTooltip
                                            active={active}
                                            point={payload?.[0]?.payload as ChartPoint | undefined}
                                            label={label}
                                            showHourly={showHourly}
                                            showLargeModel={showLargeModel}
                                            showDecisionModel={showDecisionModel}
                                        />
                                    )}
                                />
                                {showLargeModel && (
                                    <Bar
                                        dataKey="largeModelTokens"
                                        stackId="model-usage"
                                        fill="#f97316"
                                        radius={showDecisionModel ? undefined : [6, 6, 0, 0]}
                                        maxBarSize={44}
                                    >
                                        {!showDecisionModel && (
                                            <TotalTokenLabelList showLargeModel={showLargeModel} showDecisionModel={showDecisionModel} />
                                        )}
                                    </Bar>
                                )}
                                {showDecisionModel && (
                                    <Bar
                                        dataKey="decisionModelTokens"
                                        stackId={showLargeModel ? 'model-usage' : undefined}
                                        fill="#8b5cf6"
                                        radius={[6, 6, 0, 0]}
                                        maxBarSize={44}
                                    >
                                        <TotalTokenLabelList showLargeModel={showLargeModel} showDecisionModel={showDecisionModel} />
                                    </Bar>
                                )}
                                {averageLine}
                            </BarChart>
                        ) : (
                            <LineChart data={chartData} margin={chartMargin}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey={xAxisDataKey}
                                    interval={showHourly ? 2 : 0}
                                    tick={{fontSize: 10, fill: '#64748b'}}
                                    tickLine={false}
                                    axisLine={{stroke: '#e2e8f0'}}
                                    tickFormatter={(value: string) => showHourly ? `${value}:00` : value.slice(5)}
                                />
                                {chartYAxis}
                                <Tooltip
                                    cursor={{stroke: '#cbd5e1', strokeDasharray: '3 3'}}
                                    content={({active, payload, label}) => (
                                        <ChartTooltip
                                            active={active}
                                            point={payload?.[0]?.payload as ChartPoint | undefined}
                                            label={label}
                                            showHourly={showHourly}
                                            showLargeModel={showLargeModel}
                                            showDecisionModel={showDecisionModel}
                                        />
                                    )}
                                />
                                {showLargeModel && (
                                    <Line
                                        type="monotone"
                                        dataKey="largeModelTokens"
                                        stroke="#f97316"
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{r: 4}}
                                    />
                                )}
                                {showDecisionModel && (
                                    <Line
                                        type="monotone"
                                        dataKey="decisionModelTokens"
                                        stroke="#8b5cf6"
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{r: 4}}
                                    />
                                )}
                                {averageLine}
                            </LineChart>
                        )}
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="py-8 text-center text-xs text-slate-400">该日期范围暂无采集记录</div>
            )}
        </section>
    );
}
