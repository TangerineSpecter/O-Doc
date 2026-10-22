import {useEffect, useState} from 'react';
import {ArrowUpRight, Clock3, Coins, Sparkles, Ticket, Trophy} from 'lucide-react';
import type {LotteryRound} from '../../types/api/lottery';
import {LotteryBalls} from './LotteryUi';
import {lotteryDate, lotteryMoney} from './lotteryPresentation';

export function LotteryHero({round}: {round: LotteryRound | null}) {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (!round || round.status === 'settled') return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [round]);

    if (!round) return <section className="lottery-hero lottery-hero--empty">
        <span className="lottery-empty-icon"><Ticket className="h-8 w-8" strokeWidth={1.5}/></span>
        <div><h3>等待首期开售</h3><p>下一份好运，从居民的第一张彩票开始。</p></div>
    </section>;

    const settled = round.status === 'settled';
    const seconds = Math.max(0, Math.floor((new Date(round.drawsAt).getTime() - now) / 1000));
    const closed = now >= new Date(round.closesAt).getTime();
    const status = settled ? '已开奖' : !seconds ? '等待系统开奖' : closed ? '已停售' : '正在售票';
    const countdown = [
        {value: Math.floor(seconds / 86400), unit: '天'},
        {value: Math.floor(seconds % 86400 / 3600), unit: '时'},
        {value: Math.floor(seconds % 3600 / 60), unit: '分'},
        {value: seconds % 60, unit: '秒'},
    ];

    return <section className={`lottery-hero ${settled ? 'lottery-hero--settled' : ''}`} aria-label="本期奖池与开奖">
        <div className="lottery-jackpot">
            <div className="lottery-hero-watermark" aria-hidden="true"><Ticket strokeWidth={.65}/></div>
            <div className="relative flex flex-wrap items-center gap-2">
                <span className="lottery-issue">第 {String(round.sequence).padStart(3, '0')} 期</span>
                <span className="lottery-sale-state"><i/>{status}</span>
            </div>
            <p className="lottery-jackpot-label"><Sparkles className="h-3.5 w-3.5"/>{settled ? '本期一等奖奖池' : '当前一等奖奖池'}</p>
            <div className="lottery-jackpot-value"><span>{lotteryMoney(round.pool)}</span><span className="lottery-jackpot-unit">金币</span></div>
            <p className="lottery-jackpot-caption">{settled ? '每一张中奖票，都有一份好运。' : '奖池持续累积，等待幸运号码揭晓。'}</p>
            <div className="lottery-jackpot-meta">
                <span><Ticket className="h-3.5 w-3.5"/>已售 <strong>{round.ticketCount}</strong> 张</span>
                <span><Coins className="h-3.5 w-3.5"/>每张 <strong>{lotteryMoney(round.rules.ticketPrice)}</strong> 金币</span>
            </div>
        </div>
        <div className="lottery-draw">
            <div className="lottery-draw-heading">
                <span>{settled ? <Trophy className="h-4 w-4"/> : <Clock3 className="h-4 w-4"/>}{settled ? '本期幸运号码' : '距离开奖'}</span>
                <span className="lottery-timezone">北京时间</span>
            </div>
            {settled ? <div className="lottery-winning-balls"><LotteryBalls values={round.result.winningNumbers || []}/></div> :
                <div className="lottery-countdown" aria-label="开奖倒计时">
                    {countdown.map(({value, unit}) => <div key={unit} className="lottery-countdown-part">
                        <span>{String(value).padStart(2, '0')}</span><small>{unit}</small>
                    </div>)}
                </div>}
            <p className="lottery-draw-date">{lotteryDate(round.drawsAt)} 开奖</p>
            <div className="lottery-draw-note">
                {settled ? <><ArrowUpRight className="h-3.5 w-3.5"/>结转下期 <strong>{lotteryMoney(round.result.carryOut || '0')}</strong> 金币</> :
                    <><span className="lottery-draw-dot"/>{seconds ? `${lotteryDate(round.closesAt)} 停售` : '已到开奖时间，等待世界结算'}</>}
            </div>
        </div>
        <div className="lottery-hero-footnote">
            <Coins className="h-3 w-3 shrink-0"/>
            <span>{settled ? '一等奖按中奖票数分配；二、三等奖由系统另行发放。' : `奖池含${lotteryMoney(round.rules.subsidy)}金币本期补贴预估，无人购票不新增补贴。`}</span>
        </div>
    </section>;
}
