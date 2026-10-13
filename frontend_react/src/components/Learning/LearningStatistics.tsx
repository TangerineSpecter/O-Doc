import {useMemo, useState} from 'react';
import {ChevronDown} from 'lucide-react';
import type {CourseData} from '../../types/api/learning';
import {buildLearningStatistics, type LearningSkillTrend, type LearningStatisticsRange} from '../../utils/learningStatistics';
import {cardClass} from './presentation';

const ranges: {value: LearningStatisticsRange; label: string}[] = [
    {value: '30d', label: '近 30 天'},
    {value: '90d', label: '近 90 天'},
    {value: 'all', label: '全部'},
];

function formatChange(value: number | null): string {
    if (value === null) return '样本不足';
    return `${value > 0 ? '+' : ''}${value} 分`;
}

function TrendChart({label, trend, open}: {label: string; trend: LearningSkillTrend; open: (exerciseId: string) => void}) {
    const scores = trend.independent;
    const chartPoints = scores.map((item, index) => ({
        x: scores.length === 1 ? 130 : 12 + index / (scores.length - 1) * 236,
        y: 84 - item.score / 100 * 72,
        item,
    }));
    const path = chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

    return <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-700">{label}</h4>
            <span className={`text-xs font-semibold ${trend.change === null ? 'text-slate-400' : trend.change > 0 ? 'text-emerald-600' : trend.change < 0 ? 'text-orange-600' : 'text-slate-500'}`}>
                {formatChange(trend.change)}
            </span>
        </div>
        {scores.length > 0 ? <>
            <svg viewBox="0 0 260 96" role="img" aria-label={`${label}独立作答得分趋势`} className="mt-2 h-24 w-full overflow-visible">
                {[12, 48, 84].map((y, index) => <g key={y}>
                    <line x1="12" x2="248" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={index === 1 ? '3 4' : undefined}/>
                    <text x="0" y={y + 3} fill="#94a3b8" fontSize="8">{100 - index * 50}</text>
                </g>)}
                {chartPoints.length > 1 && <path d={path} fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
                {chartPoints.map(({x, y, item}) => <circle key={item.attemptId} cx={x} cy={y} r="4" fill="#fff" stroke="#f97316" strokeWidth="2">
                    <title>{item.date} · {item.score} 分</title>
                </circle>)}
            </svg>
            <div className="mt-1 flex justify-between gap-2 text-[11px] text-slate-400">
                <span>{scores[0].date.slice(5)} · {scores[0].score} 分</span>
                <span>{scores.length > 1 ? `${scores[scores.length - 1].date.slice(5)} · ${scores[scores.length - 1].score} 分` : '1 次独立验证'}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {scores.slice(-3).reverse().map(item => <button key={item.attemptId} type="button" onClick={() => open(item.exerciseId)} className="whitespace-nowrap shrink-0 text-[11px] text-orange-600 hover:text-orange-700">
                    {item.date.slice(5)} · {item.score} 分 · 回看练习 →
                </button>)}
            </div>
        </> : <p className="mt-3 rounded-lg bg-white px-3 py-4 text-center text-xs text-slate-400">{trend.assistedCount ? '本期只有提示后作答，暂不绘制独立表现趋势。' : '本期还没有独立作答记录。'}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            独立作答 {scores.length} 次 · 提示后作答 {trend.assistedCount} 次（不计入曲线）
            {scores.length > 1 && ` · 本期首次 ${trend.firstScore} 分，最近 ${trend.lastScore} 分`}
        </p>
    </div>;
}

export default function LearningStatistics({course, open}: {course: CourseData; open: (exerciseId: string) => void}) {
    const [range, setRange] = useState<LearningStatisticsRange>('30d');
    const stats = useMemo(() => buildLearningStatistics(course, range), [course, range]);
    const selectedRangeLabel = ranges.find(item => item.value === range)?.label || '近 30 天';

    return <section className={`${cardClass} space-y-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="font-semibold">学习趋势</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">按有效批改观察理解与独立表达；这是本学习文集的作答表现，不代表考试等级。</p>
            </div>
            <div role="group" aria-label="统计时间范围" className="flex flex-wrap gap-1 rounded-full bg-slate-100 p-1">
                {ranges.map(item => <button key={item.value} type="button" aria-pressed={range === item.value} onClick={() => setRange(item.value)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-colors ${range === item.value ? 'bg-white font-semibold text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {item.label}
                </button>)}
            </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-slate-100 bg-white p-4">
                <p className="text-xs text-slate-400">有成绩练习</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{stats.exerciseCount}<span className="ml-1 text-sm font-medium">份</span></p>
                <p className="mt-1 text-[11px] text-slate-400">按每份练习当前有效成绩计</p>
            </article>
            <article className="rounded-xl border border-slate-100 bg-white p-4">
                <p className="text-xs text-slate-400">正式作答天数</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{stats.studyDayCount}<span className="ml-1 text-sm font-medium">天</span></p>
                <p className="mt-1 text-[11px] text-slate-400">按学习文集时区的提交日期计</p>
            </article>
            <article className="rounded-xl border border-slate-100 bg-white p-4">
                <p className="text-xs text-slate-400">到期复习独立通过</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{stats.reviewPassCount}<span className="ml-1 text-sm font-medium">项</span></p>
                <p className="mt-1 text-[11px] text-slate-400">独立作答达到 80 分的知识点验证</p>
            </article>
        </div>

        <div>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">知识点表现变化</h3>
                <span className="text-[11px] text-slate-400">{selectedRangeLabel} · 独立作答曲线，提示后作答单独计数</span>
            </div>
            {!stats.knowledge.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-400">这个时间范围内还没有正式评分记录。完成并提交练习后，变化会显示在这里。</p> :
                <div className="space-y-2">
                    {stats.knowledge.map(point => <details key={point.id} className="group rounded-xl border border-slate-100 bg-white p-4 open:border-orange-100">
                        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 text-sm font-medium text-slate-800">{point.name}</span>
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                <span>理解 {formatChange(point.recognition.change)}</span>
                                <span>表达 {formatChange(point.expression.change)}</span>
                                <span className="flex items-center gap-1 text-slate-400">最近 {point.latestDate}<ChevronDown size={14} className="shrink-0 transition-transform group-open:rotate-180"/></span>
                            </span>
                        </summary>
                        <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
                            <TrendChart label="理解表现" trend={point.recognition} open={open}/>
                            <TrendChart label="独立表达" trend={point.expression} open={open}/>
                        </div>
                    </details>)}
                </div>}
        </div>

        <p className="text-[11px] leading-relaxed text-slate-400">每份练习使用当前有效批改版本；跳过题不参与，提示后作答不进入独立表现曲线。这里统计的是评分记录，不估算实际学习时长。</p>
    </section>;
}
