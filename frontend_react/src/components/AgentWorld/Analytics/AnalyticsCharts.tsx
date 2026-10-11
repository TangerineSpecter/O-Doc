import {useState} from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {Checkbox} from '../../common/Checkbox';
import type {ResidentAnalytics} from '../../../types/api/residentAnalytics';

const axis = {fontSize: 10, fill: '#94a3b8'};

interface TooltipPayloadItem {
    name: string;
    value: number | string;
    color: string;
    payload?: Record<string, unknown>;
}

function CustomTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: string;
}) {
    if (!active || !payload || !payload.length) return null;

    return (
        <div className="min-w-36 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur-md">
            <div className="mb-2 border-b border-slate-100 pb-1 text-[11px] font-semibold text-slate-700">
                {label}
            </div>
            <div className="space-y-1.5">
                {payload.map((item, index) => (
                    <div key={index} className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{backgroundColor: item.color}}/>
                            <span className="text-slate-500">{item.name}</span>
                        </div>
                        <span className="font-bold tabular-nums text-slate-800">{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ActivityChart({data, individual}: {data: ResidentAnalytics['daily']; individual: boolean}) {
    return (
        <div className="h-64 w-full min-w-0" role="img" aria-label="每日行为次数与活跃居民趋势">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{left: -16, right: 16, top: 10, bottom: 0}}>
                    <defs>
                        <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0.0}/>
                        </linearGradient>
                        <linearGradient id="residentGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false}/>
                    <XAxis
                        dataKey="date"
                        tick={axis}
                        tickFormatter={value => String(value).slice(5)}
                        minTickGap={20}
                        axisLine={{stroke: '#e2e8f0'}}
                        tickLine={false}
                    />
                    <YAxis tick={axis} allowDecimals={false} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Legend
                        wrapperStyle={{fontSize: 11, paddingTop: 8}}
                        iconType="circle"
                    />
                    <Area
                        name="行为次数"
                        type="monotone"
                        dataKey="behaviors"
                        stroke="#f97316"
                        strokeWidth={2.5}
                        fill="url(#activityGradient)"
                        isAnimationActive={false}
                    />
                    {!individual && (
                        <Area
                            name="活跃居民"
                            type="monotone"
                            dataKey="activeResidents"
                            stroke="#0d9488"
                            strokeWidth={2.5}
                            fill="url(#residentGradient)"
                            isAnimationActive={false}
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

interface FinancePoint {
    date: string;
    income: string;
    expense: string;
    incomePlot: number;
    expensePlot: number;
    netPlot: number;
}

interface FinanceTooltipItem {
    name: string;
    value: number | string;
    payload: FinancePoint;
}

function FinanceBarTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: FinanceTooltipItem[];
    label?: string;
}) {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0]?.payload;
    if (!item) return null;

    const income = item.incomePlot;
    const expense = item.expensePlot;
    const net = item.netPlot;
    const isProfit = net > 0;
    const isLoss = net < 0;

    return (
        <div className="min-w-44 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur-md">
            <div className="mb-2 border-b border-slate-100 pb-1 text-[11px] font-semibold text-slate-700">
                {label} 收支流水
            </div>
            <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-slate-500">
                        <span className="h-2 w-2 rounded-full bg-teal-600"/>
                        <span>实际收入</span>
                    </span>
                    <span className="font-bold tabular-nums text-teal-700">
                        ¥{income.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-slate-500">
                        <span className="h-2 w-2 rounded-full bg-rose-500"/>
                        <span>实际支出</span>
                    </span>
                    <span className="font-bold tabular-nums text-rose-600">
                        ¥{expense.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5">
                    <span className="flex items-center gap-1.5 font-medium text-slate-600">
                        <span>当日净差额</span>
                    </span>
                    <span
                        className={`font-bold tabular-nums ${
                            isProfit ? 'text-emerald-600' : isLoss ? 'text-rose-600' : 'text-slate-400'
                        }`}
                    >
                        {isProfit ? '+' : ''}¥{net.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        <span className="ml-1 text-[10px] font-normal">
                            ({isProfit ? '盈余' : isLoss ? '亏损' : '持平'})
                        </span>
                    </span>
                </div>
            </div>
        </div>
    );
}

export function FinanceChart({data}: {data: ResidentAnalytics['daily']}) {
    const [showIncome, setShowIncome] = useState(true);
    const [showExpense, setShowExpense] = useState(true);
    const [showNet, setShowNet] = useState(false);

    const points: FinancePoint[] = data.map(row => {
        const income = Number(row.income) || 0;
        const expense = Number(row.expense) || 0;
        const net = income - expense;
        return {
            ...row,
            incomePlot: income,
            expensePlot: expense,
            netPlot: net,
        };
    });

    const handleToggleIncome = (checked: boolean) => {
        if (showNet) {
            setShowNet(false);
            setShowIncome(true);
        } else {
            setShowIncome(checked);
        }
    };

    const handleToggleExpense = (checked: boolean) => {
        if (showNet) {
            setShowNet(false);
            setShowExpense(true);
        } else {
            setShowExpense(checked);
        }
    };

    const handleToggleNet = (checked: boolean) => {
        setShowNet(checked);
        if (!checked && !showIncome && !showExpense) {
            setShowIncome(true);
            setShowExpense(true);
        }
    };

    return (
        <div className="w-full min-w-0" role="img" aria-label="每日实际收入、支出柱状图与净差额走势">
            {/* 顶栏图例与差额勾选控制 */}
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-3 text-xs">
                    <Checkbox
                        size="sm"
                        checked={!showNet && showIncome}
                        onChange={handleToggleIncome}
                        boxClassName={
                            (!showNet && showIncome)
                                ? '!border-teal-600 !bg-teal-600 !shadow-teal-600/20'
                                : 'group-hover:!border-teal-400'
                        }
                        label={
                            <span className={`flex items-center gap-1.5 font-medium transition-colors ${showNet ? 'text-slate-400' : 'text-slate-700'}`}>
                                <span className={`h-2 w-2 rounded-full transition-opacity ${showNet ? 'bg-slate-300' : 'bg-teal-600'}`}/>
                                <span>收入</span>
                            </span>
                        }
                    />
                    <Checkbox
                        size="sm"
                        checked={!showNet && showExpense}
                        onChange={handleToggleExpense}
                        boxClassName={
                            (!showNet && showExpense)
                                ? '!border-rose-500 !bg-rose-500 !shadow-rose-500/20'
                                : 'group-hover:!border-rose-400'
                        }
                        label={
                            <span className={`flex items-center gap-1.5 font-medium transition-colors ${showNet ? 'text-slate-400' : 'text-slate-700'}`}>
                                <span className={`h-2 w-2 rounded-full transition-opacity ${showNet ? 'bg-slate-300' : 'bg-rose-500'}`}/>
                                <span>支出</span>
                            </span>
                        }
                    />
                </div>

                {/* 勾选差额 */}
                <div className={`flex items-center rounded-lg border px-2 py-0.5 transition-all ${
                    showNet
                        ? 'border-orange-300 bg-orange-50/80 shadow-2xs'
                        : 'border-slate-200/80 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-100/70'
                }`}>
                    <Checkbox
                        size="sm"
                        checked={showNet}
                        onChange={handleToggleNet}
                        boxClassName={
                            showNet
                                ? '!border-orange-500 !bg-orange-500 !shadow-orange-500/20'
                                : 'group-hover:!border-orange-400'
                        }
                        label={
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                                <span>展示差额 (正负盈亏)</span>
                                {showNet && (
                                    <span className="flex items-center gap-1 text-[10px] font-semibold">
                                        <span className="text-emerald-600">▲正</span>
                                        <span className="text-rose-600">▼负</span>
                                    </span>
                                )}
                            </span>
                        }
                    />
                </div>
            </div>

            <div className="h-60 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={points}
                        margin={{left: -12, right: 12, top: 10, bottom: 0}}
                        barGap={2}
                        barCategoryGap={showNet ? '28%' : '24%'}
                    >
                        <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false}/>
                        <XAxis
                            dataKey="date"
                            tick={axis}
                            tickFormatter={value => String(value).slice(5)}
                            minTickGap={25}
                            axisLine={{stroke: '#e2e8f0'}}
                            tickLine={false}
                        />
                        <YAxis
                            tick={axis}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={val => val === 0 ? '0' : `¥${Math.round(val)}`}
                        />
                        <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3"/>
                        <Tooltip content={<FinanceBarTooltip/>}/>
                        {!showNet && showIncome && (
                            <Bar
                                name="收入"
                                dataKey="incomePlot"
                                fill="#0d9488"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={14}
                                isAnimationActive={false}
                            />
                        )}
                        {!showNet && showExpense && (
                            <Bar
                                name="支出"
                                dataKey="expensePlot"
                                fill="#f43f5e"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={14}
                                isAnimationActive={false}
                            />
                        )}
                        {showNet && (
                            <Bar
                                name="净差额"
                                dataKey="netPlot"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={14}
                                isAnimationActive={false}
                            >
                                {points.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.netPlot >= 0 ? '#10b981' : '#f43f5e'}
                                    />
                                ))}
                            </Bar>
                        )}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
