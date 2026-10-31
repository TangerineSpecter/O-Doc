import type {QuantFactorFamily, QuantFactorRole} from '../../types/api/quant';
import { Filter, Sigma, Zap } from 'lucide-react';

export const factorRoles: Record<QuantFactorRole, string> = {factor: '计算因子', signal: '信号条件', filter: '过滤条件', risk: '风控模块', execution: '执行模块', display: '显示模块'};
export const factorFamilies: Record<QuantFactorFamily, string> = {momentum: '动量', trend: '趋势', volatility: '波动率', mean_reversion: '均值回归', volume: '量能', price_structure: '价格结构', fundamental: '基本面', other: '其他'};

export interface RolePresentation {
    label: string;
    icon: typeof Sigma;
    theme: {
        iconBg: string;
        iconColor: string;
        iconBorder: string;
        badgeBg: string;
        badgeText: string;
        badgeBorder: string;
        accentBar: string;
    };
}

export const rolePresentations: Record<QuantFactorRole, RolePresentation> = {
    factor: {
        label: '计算因子',
        icon: Sigma,
        theme: {
            iconBg: 'bg-gradient-to-br from-orange-50 to-amber-100/70',
            iconColor: 'text-amber-700',
            iconBorder: 'border-orange-200/80',
            badgeBg: 'bg-orange-50',
            badgeText: 'text-orange-700',
            badgeBorder: 'border-orange-200/80',
            accentBar: 'bg-orange-500',
        },
    },
    signal: {
        label: '信号条件',
        icon: Zap,
        theme: {
            iconBg: 'bg-gradient-to-br from-sky-50 to-blue-100/70',
            iconColor: 'text-sky-700',
            iconBorder: 'border-sky-200/80',
            badgeBg: 'bg-sky-50',
            badgeText: 'text-sky-700',
            badgeBorder: 'border-sky-200/80',
            accentBar: 'bg-sky-500',
        },
    },
    filter: {
        label: '过滤条件',
        icon: Filter,
        theme: {
            iconBg: 'bg-gradient-to-br from-emerald-50 to-teal-100/70',
            iconColor: 'text-emerald-700',
            iconBorder: 'border-emerald-200/80',
            badgeBg: 'bg-emerald-50',
            badgeText: 'text-emerald-700',
            badgeBorder: 'border-emerald-200/80',
            accentBar: 'bg-emerald-500',
        },
    },
    risk: {
        label: '风控模块',
        icon: Filter,
        theme: {
            iconBg: 'bg-gradient-to-br from-rose-50 to-red-100/70',
            iconColor: 'text-rose-700',
            iconBorder: 'border-rose-200/80',
            badgeBg: 'bg-rose-50',
            badgeText: 'text-rose-700',
            badgeBorder: 'border-rose-200/80',
            accentBar: 'bg-rose-500',
        },
    },
    execution: {
        label: '执行模块',
        icon: Zap,
        theme: {
            iconBg: 'bg-gradient-to-br from-slate-100 to-slate-200/70',
            iconColor: 'text-slate-700',
            iconBorder: 'border-slate-300/80',
            badgeBg: 'bg-slate-100',
            badgeText: 'text-slate-700',
            badgeBorder: 'border-slate-300/80',
            accentBar: 'bg-slate-500',
        },
    },
    display: {
        label: '显示模块',
        icon: Sigma,
        theme: {
            iconBg: 'bg-gradient-to-br from-violet-50 to-purple-100/70',
            iconColor: 'text-purple-700',
            iconBorder: 'border-purple-200/80',
            badgeBg: 'bg-purple-50',
            badgeText: 'text-purple-700',
            badgeBorder: 'border-purple-200/80',
            accentBar: 'bg-purple-500',
        },
    },
};

export const factorFamilyStyles: Record<QuantFactorFamily, { badge: string; dot: string }> = {
    momentum: { badge: 'border-amber-200/80 bg-amber-50/80 text-amber-700', dot: 'bg-amber-500' },
    trend: { badge: 'border-sky-200/80 bg-sky-50/80 text-sky-700', dot: 'bg-sky-500' },
    volatility: { badge: 'border-purple-200/80 bg-purple-50/80 text-purple-700', dot: 'bg-purple-500' },
    mean_reversion: { badge: 'border-teal-200/80 bg-teal-50/80 text-teal-700', dot: 'bg-teal-500' },
    volume: { badge: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700', dot: 'bg-emerald-500' },
    price_structure: { badge: 'border-slate-200/80 bg-slate-100/80 text-slate-700', dot: 'bg-slate-500' },
    fundamental: { badge: 'border-rose-200/80 bg-rose-50/80 text-rose-700', dot: 'bg-rose-500' },
    other: { badge: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400' },
};
export const factorOutputs = {numeric_series: '数值序列', boolean_series: '条件序列', scalar: '标量', platform_specific: '平台相关输出'};
