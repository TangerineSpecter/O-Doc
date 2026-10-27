import type { MT4Event, MT4Report } from '../types/api/mt4Archive';

/**
 * 是否属于无意义的占位符
 */
export function isPlaceholderCell(val: string): boolean {
    if (!val) return true;
    const trimmed = val.trim();
    return !trimmed || ['——', '--', '-', '—', 'n/a', 'null'].includes(trimmed.toLowerCase());
}

/**
 * 从 MT4 报告的二维指标矩阵中，根据关键字检索对应指标的值
 */
export function reportMetric(report: MT4Report, labels: string[]): string {
    const wanted = labels.map((label) => label.toLowerCase().replace(/\s+/g, ''));
    for (const rawRow of report.metrics || []) {
        if (!rawRow || !rawRow.length) continue;
        // 清理首尾占位符
        const row = rawRow.map((c) => (c || '').trim());
        for (let index = 0; index < row.length - 1; index++) {
            const cell = row[index].toLowerCase().replace(/\s+/g, '');
            if (wanted.some((w) => cell === w || cell.includes(w))) {
                const next = row[index + 1];
                if (!isPlaceholderCell(next)) {
                    return next;
                }
            }
        }
    }
    return '';
}

export interface MT4KPIs {
    initialDeposit: string;
    initialDepositNum: number | null;
    totalNetProfit: string;
    totalNetProfitNum: number | null;
    grossProfit: string;
    grossLoss: string;
    profitFactor: string;
    expectedPayoff: string;
    maxDrawdown: string;
    maxDrawdownPercent: string;
    relativeDrawdown: string;
    absoluteDrawdown: string;
    totalTrades: string;
    totalTradesNum: number | null;
    profitTrades: string;
    lossTrades: string;
    winRate: string;
    winRateNum: number | null;
    longWon: string;
    shortWon: string;
    modellingQuality: string;
    roiPercent: string;
    roiNum: number | null;
}

/**
 * 提取核心量化回测 KPI 指标（全面覆盖各种中英文 MT4 报告变体）
 */
export function extractMT4Kpis(report: MT4Report, events: MT4Event[] = []): MT4KPIs {
    const find = (keywords: string[]) => reportMetric(report, keywords);

    const initialStr = find(['起始资金', 'initial deposit', '初始资金', 'deposit']);
    const netProfitStr = find(['总净盈利', '总净利润', 'total net profit', '净利润', 'net profit']);
    const grossProfit = find(['总获利', '总盈利', 'gross profit', '毛盈利', '毛获利']);
    const grossLoss = find(['总亏损', 'gross loss', '毛亏损']);
    const profitFactor = find(['盈利比', '获利率', 'profit factor', '盈亏比']);
    const expectedPayoff = find(['预期盈利', 'expected payoff', '期望收益']);
    const maxDrawdownRaw = find(['最大亏损', 'maximal drawdown', '最大回撤']);
    const relativeDrawdown = find(['相对亏损', 'relative drawdown', '相对回撤']);
    const absoluteDrawdown = find(['绝对亏损', 'absolute drawdown', '绝对回撤']);
    const totalTradesStr = find(['交易单总计', 'total trades', '总交易数', '成交总数']);
    const tradeCountReport = {...report, metrics: report.metrics?.filter(row => {
        const first = row.find(cell => !isPlaceholderCell(cell))?.trim().replace(/[:：]+$/, '').toLowerCase();
        return !first || !['最大', '平均', '最多', '最小', 'maximal', 'average', 'maximum'].includes(first);
    })};
    const profitTrades = reportMetric(tradeCountReport, ['盈利交易', 'profit trades', '盈利单']);
    const lossTrades = reportMetric(tradeCountReport, ['亏损交易', 'loss trades', '亏损单']);
    const longWon = find(['买单', '多单', 'long positions', 'long positions (won %)']);
    const shortWon = find(['卖单', '空单', 'short positions', 'short positions (won %)']);
    const modellingQuality = find(['复盘模型的质量', '复盘模型质量', '每张图纸的总量', 'modelling quality', '建模品质', '模拟质量']);

    // 解析数值辅助
    const parseNum = (str: string): number | null => {
        if (!str) return null;
        const match = str.replace(/,/g, '').match(/[-+]?\d+(\.\d+)?/);
        return match ? parseFloat(match[0]) : null;
    };

    let initialDepositNum = parseNum(initialStr);
    let totalNetProfitNum = parseNum(netProfitStr);
    let totalTradesNum = parseNum(totalTradesStr);

    // 如果 metrics 缺失，从 events 平仓事件中推导补齐
    const closeEvents = events.filter((e) => ['close', 's/l', 't/p'].includes(e.type?.trim().toLowerCase()));
    const closes = closeEvents.filter((e) => e.balance?.trim() && Number.isFinite(Number(e.balance)));
    const closeSet = new Set(closeEvents);
    const completeProfits = closeEvents.length > 0 && closeEvents.every(e => e.profit?.trim() && Number.isFinite(Number(e.profit)));
    const completeBalances = closes.length === closeEvents.length && events.every(e => !e.balance?.trim() || closeSet.has(e));
    if (closes.length > 0) {
        if (totalNetProfitNum === null && completeProfits && completeBalances) {
            const totalProfitSum = closes.reduce((sum, e) => {
                const p = Number(e.profit);
                return Number.isFinite(p) ? sum + p : sum;
            }, 0);
            totalNetProfitNum = totalProfitSum;
        }
        if (initialDepositNum === null && completeProfits && completeBalances) {
            const firstBalance = Number(closes[0].balance);
            const firstProfit = Number(closes[0].profit) || 0;
            if (Number.isFinite(firstBalance)) {
                initialDepositNum = firstBalance - firstProfit;
            }
        }
        if (totalTradesNum === null && completeBalances) {
            totalTradesNum = closes.length;
        }
    }

    // 计算 ROI 百分比
    let roiNum: number | null = null;
    let roiPercent = '';
    if (initialDepositNum && initialDepositNum > 0 && totalNetProfitNum !== null) {
        roiNum = (totalNetProfitNum / initialDepositNum) * 100;
        roiPercent = `${roiNum >= 0 ? '+' : ''}${roiNum.toFixed(2)}%`;
    }

    // 胜率提取
    let winRate = '';
    let winRateNum: number | null = null;
    if (profitTrades) {
        const percentMatch = profitTrades.match(/(\d+(\.\d+)?)%/);
        if (percentMatch) {
            winRateNum = parseFloat(percentMatch[1]);
            winRate = `${winRateNum.toFixed(2)}%`;
        }
    }
    if (!winRate && completeProfits && completeBalances) {
        const wins = closes.filter((e) => Number(e.profit) > 0).length;
        winRateNum = (wins / closes.length) * 100;
        winRate = `${winRateNum.toFixed(2)}%`;
    }

    // 解析最大回撤百分比
    let maxDrawdownPercent = '';
    if (maxDrawdownRaw) {
        const pMatch = maxDrawdownRaw.match(/(\d+(\.\d+)?)%/);
        if (pMatch) {
            maxDrawdownPercent = `${pMatch[1]}%`;
        }
    }

    return {
        initialDeposit: initialStr || (initialDepositNum !== null ? initialDepositNum.toFixed(2) : '—'),
        initialDepositNum,
        totalNetProfit: netProfitStr || (totalNetProfitNum !== null ? totalNetProfitNum.toFixed(2) : '—'),
        totalNetProfitNum,
        grossProfit: grossProfit || '—',
        grossLoss: grossLoss || '—',
        profitFactor: profitFactor || '—',
        expectedPayoff: expectedPayoff || '—',
        maxDrawdown: maxDrawdownRaw || '—',
        maxDrawdownPercent,
        relativeDrawdown: relativeDrawdown || '—',
        absoluteDrawdown: absoluteDrawdown || '—',
        totalTrades: totalTradesStr || (totalTradesNum !== null ? String(totalTradesNum) : '—'),
        totalTradesNum,
        profitTrades: profitTrades || '—',
        lossTrades: lossTrades || '—',
        winRate: winRate || '—',
        winRateNum,
        longWon: longWon || '—',
        shortWon: shortWon || '—',
        modellingQuality: modellingQuality || '—',
        roiPercent,
        roiNum,
    };
}

export interface MetricItem {
    label: string;
    value: string;
}

export interface MetricGroup {
    key: string;
    title: string;
    icon: string;
    items: MetricItem[];
}

export interface StreakComparison {
    metric: string;
    profitVal: string;
    lossVal: string;
}

/**
 * 将 MT4 报告指标解析为规范结构化分组（彻底解决错位与分类混乱问题）
 */
export function groupMT4Metrics(report: MT4Report): MetricGroup[] {
    const rawRows = report.metrics || [];
    if (!rawRows.length) return [];

    const capitalItems: MetricItem[] = [];
    const riskItems: MetricItem[] = [];
    const tradeItems: MetricItem[] = [];
    const extremeItems: MetricItem[] = [];
    const qualityItems: MetricItem[] = [];
    const otherItems: MetricItem[] = [];

    for (const rawRow of rawRows) {
        if (!rawRow || !rawRow.length) continue;

        // 去除空项与首尾空格
        const cells = rawRow.map((c) => (c || '').trim());
        // 过滤掉完全为空的行
        if (!cells.some((c) => Boolean(c) && !isPlaceholderCell(c))) continue;

        // 识别模式 1：以“最大”、“平均”、“最多”、“最小”等前缀开头的极值行
        // 例如：["最大", "获利交易", "67.13", "亏损交易", "-25.23"] 或带有空列的
        const firstNonEmptyIndex = cells.findIndex((c) => Boolean(c) && !isPlaceholderCell(c));
        if (firstNonEmptyIndex !== -1) {
            const firstCell = cells[firstNonEmptyIndex].replace(/[:：]+\s*$/, '').trim();
            if (['最大', '平均', '最多', '最小', 'maximal', 'average', 'maximum'].includes(firstCell.toLowerCase())) {
                const prefix = firstCell;
                const rest = cells.slice(firstNonEmptyIndex + 1);
                for (let i = 0; i + 1 < rest.length; i += 2) {
                    if (!isPlaceholderCell(rest[i])) extremeItems.push({label: `${prefix} ${rest[i]}`, value: isPlaceholderCell(rest[i + 1]) ? '—' : rest[i + 1]});
                }
                continue;
            }
        }

        // 识别模式 2：去除前导占位符（例如：["——", "盈利交易 (%占总百分比)", "100 (70.92%)", ...]）
        const validTokens = cells.slice(firstNonEmptyIndex);

        // 两两组合 token [label, value, label, value, ...]
        for (let i = 0; i < validTokens.length - 1; i += 2) {
            const label = validTokens[i];
            const val = isPlaceholderCell(validTokens[i + 1]) ? '—' : validTokens[i + 1];
            if (isPlaceholderCell(label)) continue;

            const l = label.toLowerCase().replace(/\s+/g, '');

            // 规则优先：交易与胜率（排在资金之前，避免“买单(%获利百分比)”因包含“获利”被误归入资金）
            if (
                l.includes('交易单') ||
                l.includes('买单') ||
                l.includes('卖单') ||
                l.includes('多单') ||
                l.includes('空单') ||
                l.includes('盈利交易') ||
                l.includes('亏损交易') ||
                l.includes('positions') ||
                l.includes('trades')
            ) {
                tradeItems.push({ label, value: val });
            }
            // 规则二：资金与收益
            else if (
                l.includes('资金') ||
                l.includes('deposit') ||
                l.includes('净盈利') ||
                l.includes('净利润') ||
                l.includes('netprofit') ||
                l.includes('总获利') ||
                l.includes('总盈利') ||
                l.includes('grossprofit') ||
                l.includes('总亏损') ||
                l.includes('grossloss') ||
                l.includes('盈利比') ||
                l.includes('获利率') ||
                l.includes('profitfactor') ||
                l.includes('预期') ||
                l.includes('payoff') ||
                l.includes('点值')
            ) {
                capitalItems.push({ label, value: val });
            }
            // 规则三：风险与回撤
            else if (l.includes('亏损') || l.includes('回撤') || l.includes('drawdown')) {
                riskItems.push({ label, value: val });
            }
            // 规则四：极值与连续统计
            else if (
                l.includes('最大') ||
                l.includes('平均') ||
                l.includes('最多') ||
                l.includes('连续') ||
                l.includes('consecutive')
            ) {
                extremeItems.push({ label, value: val });
            }
            // 规则五：回测模型与品质
            else if (
                l.includes('柱数') ||
                l.includes('即时价') ||
                l.includes('质量') ||
                l.includes('品质') ||
                l.includes('存根') ||
                l.includes('差错') ||
                l.includes('错误') ||
                l.includes('点差') ||
                l.includes('差价') ||
                l.includes('quality') ||
                l.includes('bars') ||
                l.includes('ticks') ||
                l.includes('spread')
            ) {
                qualityItems.push({ label, value: val });
            }
            // 其他指标
            else {
                otherItems.push({ label, value: val });
            }
        }
    }

    const groups: MetricGroup[] = [];
    if (capitalItems.length) groups.push({ key: 'capital', title: '资金与收益能力', icon: 'Coins', items: capitalItems });
    if (riskItems.length) groups.push({ key: 'risk', title: '风险与回撤控制', icon: 'ShieldAlert', items: riskItems });
    if (tradeItems.length) groups.push({ key: 'trades', title: '交易单数与多空胜率', icon: 'Target', items: tradeItems });
    if (extremeItems.length) groups.push({ key: 'extremes', title: '单笔极值与连续统计', icon: 'BarChart3', items: extremeItems });
    if (qualityItems.length) groups.push({ key: 'quality', title: '复盘模型与数据质量', icon: 'CheckCircle2', items: qualityItems });
    if (otherItems.length) groups.push({ key: 'others', title: '其他补充指标', icon: 'Sliders', items: otherItems });

    return groups;
}

/**
 * 提取极值连赢连亏对比矩阵
 */
export function extractStreakComparisons(groups: MetricGroup[]): StreakComparison[] {
    const extremeGroup = groups.find((g) => g.key === 'extremes');
    if (!extremeGroup) return [];

    const items = extremeGroup.items;
    const findVal = (keywords: string[]) => {
        const item = items.find((it) => keywords.every((kw) => it.label.includes(kw)));
        return item?.value || '—';
    };

    return [
        {
            metric: '最大单笔交易',
            profitVal: findVal(['最大', '获利交易']),
            lossVal: findVal(['最大', '亏损交易']),
        },
        {
            metric: '平均单笔交易',
            profitVal: findVal(['平均', '获利交易']),
            lossVal: findVal(['平均', '亏损交易']),
        },
        {
            metric: '连续获利/亏损金额',
            profitVal: findVal(['连续', '获利金额']),
            lossVal: findVal(['连续', '亏损金额']),
        },
        {
            metric: '最多连续获利/亏损次数',
            profitVal: findVal(['最多', '获利次数']),
            lossVal: findVal(['最多', '亏损次数']),
        },
        {
            metric: '平均连续获利/亏损',
            profitVal: findVal(['平均', '连续获利']),
            lossVal: findVal(['平均', '连续亏损']),
        },
    ];
}

export interface PeriodInfo {
    raw: string;
    timeframe: string;
    displayRange: string;
    dateRange: string;
    baselineRange?: string;
}

/**
 * 智能解析 MT4 的周期与时间区间字段
 */
export function parsePeriodInfo(raw: string = ''): PeriodInfo {
    if (!raw.trim()) return { raw: '', timeframe: '', displayRange: '—', dateRange: '—' };
    const str = raw.trim();

    // 检查是否有括号，例如 (2023.01.01 - 2024.01.01)
    let baselineRange = '';
    let mainStr = str;
    const parenMatch = str.match(/\(([^)]+)\)$/);
    if (parenMatch) {
        baselineRange = parenMatch[1].trim();
        mainStr = str.substring(0, parenMatch.index).trim();
    }

    // 提取时间周期前缀（如 5 分钟图, M5, H1, 15 分钟图 等）
    const tfMatch = mainStr.match(
        /^([0-9]+\s*(?:分钟图|小时图|日线图|周线图|月线图|分钟|小时|日线)|[MHDW][0-9]+|Daily|Weekly|Monthly|Every\s*Tick)/i,
    );
    let timeframe = '';
    let dateRange = mainStr;

    if (tfMatch) {
        timeframe = tfMatch[1].trim();
        dateRange = mainStr.substring(tfMatch[0].length).trim();
    }

    // 去除开头可能残留的分隔符
    dateRange = dateRange.replace(/^[-—·:\s]+/, '').trim();

    // 格式化出不带时分秒的干净日期区间（优先使用基准全区间，如 2023.01.01 - 2024.01.01）
    let displayRange = '';
    if (baselineRange) {
        displayRange = baselineRange;
    } else if (dateRange) {
        displayRange = dateRange
            .replace(/\s+\d{1,2}:\d{2}(?::\d{2})?/g, '')
            .trim();
    } else {
        displayRange = mainStr;
    }

    return {
        raw: str,
        timeframe,
        displayRange: displayRange || dateRange || mainStr,
        dateRange: dateRange || mainStr,
        baselineRange,
    };
}

export interface ModelInfo {
    raw: string;
    name: string;
    detail?: string;
}

/**
 * 智能解析 MT4 的复盘模型字段
 */
export function parseModelInfo(raw: string = ''): ModelInfo {
    if (!raw.trim()) return { raw: '', name: '—' };
    const str = raw.trim();
    const parenMatch = str.match(/^([^(（]+)[(（]([^)）]+)[)）]$/);
    if (parenMatch) {
        return {
            raw: str,
            name: parenMatch[1].trim(),
            detail: parenMatch[2].trim(),
        };
    }
    return {
        raw: str,
        name: str,
    };
}
