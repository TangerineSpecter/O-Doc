import {useEffect, useState} from 'react';
import {ArrowUpRight, CheckCircle2, Clock3, Coins, Sparkles, Ticket, Trophy} from 'lucide-react';
import type {LotteryConfig, LotteryRound} from '../../types/api/lottery';
import {LotteryBalls} from './LotteryUi';
import {lotteryDate, lotteryMoney} from './lotteryPresentation';

interface LotteryHeroProps {
    round: LotteryRound | null;
    config?: LotteryConfig;
    onEnable?: () => Promise<void> | void;
    saving?: boolean;
}

export function LotteryHero({round, config, onEnable, saving = false}: LotteryHeroProps) {
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
        if (!round || round.status === 'settled') return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [round]);

    // 首期未开售或空状态时展示「趣味引导看板」
    if (!round) {
        const previewBalls = [
            {val: 1, lucky: false},
            {val: 2, lucky: false},
            {val: 3, lucky: true},
            {val: 4, lucky: false},
            {val: 5, lucky: false},
            {val: 6, lucky: false},
            {val: 7, lucky: true},
            {val: 8, lucky: false},
            {val: 9, lucky: true},
            {val: 10, lucky: false},
        ];

        return <section className="lottery-guide-hero" aria-label="大乐透首期引导">
            <div className="lottery-hero-watermark" aria-hidden="true"><Ticket strokeWidth={0.5}/></div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="lottery-guide-badge">
                    <Sparkles className="h-3.5 w-3.5"/>首期筹备中 · 攒下一份幸运期待
                </span>
                <span className="text-[11px] font-medium text-amber-800/80">每三天一期 · 20:00 准时开奖</span>
            </div>

            <div className="lottery-guide-header">
                <h3>居民大乐透 · 幸运号码站</h3>
                <p>居民会在每日生活日程中，根据个人财务与闲暇自主前往彩票站选号。你可以随时在此查阅当期奖池、倒计时及出票记录。</p>
            </div>

            {/* 1~10 选 3 幸运号码预览 */}
            <div className="lottery-guide-numbers">
                <div className="lottery-guide-balls-row" aria-label="1到10选号演示">
                    {previewBalls.map(b => (
                        <span
                            key={b.val}
                            className={`lottery-guide-ball ${b.lucky ? 'lottery-guide-ball--lucky' : 'lottery-guide-ball--normal'}`}
                            title={b.lucky ? '示例幸运球' : `号码 ${b.val}`}
                        >
                            {String(b.val).padStart(2, '0')}
                        </span>
                    ))}
                </div>
                <div className="lottery-guide-numbers-hint">
                    <Coins className="h-3.5 w-3.5 text-amber-600"/>
                    <span>从 1~10 中自选 3 个数字 · 共 120 种幸运组合</span>
                </div>
            </div>

            {/* 玩法亮点卡片 */}
            <div className="lottery-guide-features">
                <div className="lottery-guide-feature">
                    <span className="lottery-guide-feature-icon"><Ticket className="h-4 w-4"/></span>
                    <div className="lottery-guide-feature-content">
                        <h4>居民自主购票</h4>
                        <p>单张 5 金币，每人每期最多 10 张，相同号码可重复加倍购买。</p>
                    </div>
                </div>
                <div className="lottery-guide-feature">
                    <span className="lottery-guide-feature-icon"><Coins className="h-4 w-4"/></span>
                    <div className="lottery-guide-feature-content">
                        <h4>100 金币起步补贴</h4>
                        <p>每期实际有购票即注资金币补贴，若无人中一等奖全额滚存下期。</p>
                    </div>
                </div>
                <div className="lottery-guide-feature">
                    <span className="lottery-guide-feature-icon"><Clock3 className="h-4 w-4"/></span>
                    <div className="lottery-guide-feature-content">
                        <h4>定期自动开奖</h4>
                        <p>每 3 天 20:00 开奖（19:55 停售），二、三等奖固定发放，不扣一等奖池。</p>
                    </div>
                </div>
            </div>

            {/* 快捷操作栏 */}
            <div className="lottery-guide-action-bar">
                {config && !config.enabled ? (
                    <>
                        <span className="text-xs text-amber-800">
                            大乐透购票能力尚未开启，居民暂不会生成购票生活日程。
                        </span>
                        {onEnable && (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void onEnable()}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-orange-600 active:scale-95 disabled:opacity-50"
                            >
                                <Sparkles className="h-3.5 w-3.5"/>
                                {saving ? '正在启用…' : '立即启用大乐透'}
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600"/>
                            购票能力已开启 · 等待世界运行中居民前往彩票站，首期即将开售！
                        </span>
                        <span className="text-xs text-slate-400">北京时间 20:00 开奖</span>
                    </>
                )}
            </div>
        </section>;
    }

    const settled = round.status === 'settled';
    const seconds = Math.max(0, Math.floor((new Date(round.drawsAt).getTime() - now) / 1000));
    const closed = now >= new Date(round.closesAt).getTime();
    const statusText = settled ? '已开奖' : !seconds ? '等待系统开奖' : closed ? '已停售' : '正在售票';
    const statusClass = settled
        ? 'lottery-status-chip--settled'
        : !seconds
          ? 'lottery-status-chip--waiting'
          : closed
            ? 'lottery-status-chip--closed'
            : 'lottery-status-chip--open';

    const countdown = [
        {value: Math.floor(seconds / 86400), unit: '天'},
        {value: Math.floor((seconds % 86400) / 3600), unit: '时'},
        {value: Math.floor((seconds % 3600) / 60), unit: '分'},
        {value: seconds % 60, unit: '秒'},
    ];

    return <section className={`lottery-hero ${settled ? 'lottery-hero--settled' : ''}`} aria-label="本期奖池与开奖">
        <div className="lottery-jackpot">
            <div className="lottery-hero-watermark" aria-hidden="true"><Ticket strokeWidth={0.6}/></div>
            <div className="relative flex flex-wrap items-center gap-2">
                <span className="lottery-issue-badge">第 {String(round.sequence).padStart(3, '0')} 期</span>
                <span className={`lottery-status-chip ${statusClass}`}>
                    <i className="lottery-status-dot"/>
                    {statusText}
                </span>
            </div>

            <p className="lottery-jackpot-label">
                <Sparkles className="h-3.5 w-3.5"/>
                {settled ? '本期一等奖奖池' : '当前一等奖累积奖池'}
            </p>
            <div className="lottery-jackpot-value">
                <span>{lotteryMoney(round.pool)}</span>
                <span className="lottery-jackpot-unit">金币</span>
            </div>
            <p className="lottery-jackpot-caption">
                {settled ? '每一张中奖票，都有一份好运。' : '奖池持续累积，包含 100 金币本期补贴预估。'}
            </p>

            <div className="lottery-jackpot-meta">
                <span><Ticket className="h-3.5 w-3.5 text-amber-600"/>已售 <strong>{round.ticketCount}</strong> 张</span>
                <span><Coins className="h-3.5 w-3.5 text-amber-600"/>单张 <strong>{lotteryMoney(round.rules.ticketPrice)}</strong> 金币</span>
                <span><Sparkles className="h-3.5 w-3.5 text-amber-600"/>补贴预估 <strong>{lotteryMoney(round.rules.subsidy)}</strong> 金币</span>
            </div>
        </div>

        <div className="lottery-draw">
            <div className="lottery-draw-heading">
                <span>
                    {settled ? <Trophy className="h-4 w-4 text-amber-600"/> : <Clock3 className="h-4 w-4 text-amber-600"/>}
                    {settled ? '本期幸运开奖号码' : '距离开奖倒计时'}
                </span>
                <span className="lottery-timezone">北京时间</span>
            </div>

            {settled ? (
                <div className="lottery-winning-balls">
                    <LotteryBalls values={round.result.winningNumbers || []}/>
                </div>
            ) : (
                <div className="lottery-countdown" aria-label="开奖倒计时">
                    {countdown.map(({value, unit}) => (
                        <div key={unit} className="lottery-countdown-part">
                            <span>{String(value).padStart(2, '0')}</span>
                            <small>{unit}</small>
                        </div>
                    ))}
                </div>
            )}

            <p className="lottery-draw-date">{lotteryDate(round.drawsAt)} 开奖</p>
            <div className="lottery-draw-note">
                {settled ? (
                    <>
                        <ArrowUpRight className="h-3.5 w-3.5 text-amber-600"/>
                        结转下期 <strong>{lotteryMoney(round.result.carryOut || '0')}</strong> 金币
                    </>
                ) : (
                    <>
                        <span className="lottery-draw-dot"/>
                        {seconds ? `${lotteryDate(round.closesAt)} 停售` : '已到开奖时间，等待世界结算'}
                    </>
                )}
            </div>
        </div>

        <div className="lottery-hero-footnote">
            <Coins className="h-3.5 w-3.5 shrink-0"/>
            <span>
                {settled
                    ? '一等奖按中奖票数平分；二、三等奖由系统按每人固定发放，不扣一等奖奖池。'
                    : `奖池含 ${lotteryMoney(round.rules.subsidy)} 金币本期补贴预估，无人购票时不新增补贴。`}
            </span>
        </div>
    </section>;
}
