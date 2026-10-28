import type {MT4Report} from '../types/api/mt4Archive';
import {reportMetric} from './mt4Report';

/** 回测目录使用报告摘要，缺失项不推测。 */
export function mt4BacktestLabel(report: MT4Report): string {
    const symbol = report.fields?.symbol?.split(/[（(]/, 1)[0].trim() || '—';
    const rawPeriod = report.fields?.period?.trim() || '';
    const dates = rawPeriod.match(/\d{4}\.\d{2}\.\d{2}/g);
    const range = dates && dates.length >= 2 ? `${dates[0]}～${dates[1]}` : '';
    const periodLabel = range || '—';
    const profit = reportMetric(report, ['总净盈利', '总净利润', 'total net profit', '净盈利', '净利润', 'net profit']);
    const numericProfit = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(profit)
        ? Number(profit.replace(/,/g, '')) : null;
    const profitLabel = numericProfit === null ? profit || '—'
        : `${numericProfit > 0 ? '盈利' : numericProfit < 0 ? '亏损' : '盈亏'} ${profit.replace(/^[+-]/, '')} 美金`;
    const drawdown = reportMetric(report, ['最大亏损', 'maximal drawdown', '最大回撤']);
    const drawdownAmount = drawdown.match(/^\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?=\s*(?:\(|（|$))/)?.[1];
    const drawdownLabel = drawdownAmount ? `回撤 ${drawdownAmount.replace(/^[+-]/, '')} 美金` : drawdown ? `回撤 ${drawdown}` : '回撤 —';
    return `${symbol} · ${periodLabel} · ${profitLabel} · ${drawdownLabel}`;
}
