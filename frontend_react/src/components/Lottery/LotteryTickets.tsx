import {Check, Sparkles, Ticket} from 'lucide-react';
import type {LotteryPage, LotteryRound, LotteryTicket} from '../../types/api/lottery';
import {LotteryBalls, LotteryPagination} from './LotteryUi';
import {lotteryDate, lotteryMoney} from './lotteryPresentation';
import {LotteryIcon} from './LotteryIcon';

const residentTone = (id: string) => {
    const hash = Array.from(id).reduce((value, char) => value + char.charCodeAt(0), 0);
    return ['orange', 'sage', 'blue', 'rose'][hash % 4];
};

export function LotteryTickets({
    tickets,
    round,
    page,
    onPage,
}: {
    tickets: LotteryPage<LotteryTicket>;
    round: LotteryRound | null;
    page: number;
    onPage: (page: number) => void;
}) {
    const winning = round?.result.winningNumbers || [];

    const getTierLabel = (matches: number | null) => {
        if (matches === null) return null;
        if (matches === 3) return '一等奖 (全中)';
        if (matches === 2) return '二等奖 (中2个)';
        if (matches === 1) return '三等奖 (中1个)';
        return null;
    };

    return <section className="lottery-tickets-section" aria-label="本期彩票">
        <div className="lottery-section-heading">
            <div>
                <Ticket className="h-4 w-4"/>
                <h3>居民的幸运票</h3>
                <span className="lottery-count-badge">{tickets.total} 张</span>
            </div>
            <span className="lottery-section-hint">
                {round?.status === 'settled' ? '号码已揭晓 · 奖金已入账' : '每张票，都是一份小小的生活期待'}
            </span>
        </div>

        {!tickets.items.length ? (
            <div className="lottery-tickets-empty">
                <div className="lottery-empty-tickets-icon" aria-hidden="true">
                    <LotteryIcon className="h-7 w-7"/>
                </div>
                <h4>本期还没有居民前去购票</h4>
                <p>居民在每日生活日程中，将根据闲暇与现金自主前往彩票站选号。当产生购票时，这里将实时展示他们购买的幸运票根。</p>
                <div className="lottery-empty-tags">
                    <span className="lottery-empty-tag">🎟️ 单张 5 金币</span>
                    <span className="lottery-empty-tag">🎯 1~10 选 3 个数字</span>
                    <span className="lottery-empty-tag">✨ 每人每期上限 10 张</span>
                    <span className="lottery-empty-tag">🍀 相同号码可重复购买</span>
                </div>
            </div>
        ) : (
            <div className="lottery-ticket-grid scrollbar-hide">
                {tickets.items.map(ticket => {
                    const tierLabel = getTierLabel(ticket.matches);
                    const isWinner = Boolean(tierLabel);

                    return <article
                        key={ticket.id}
                        className={`lottery-ticket ${isWinner ? 'lottery-ticket--winner' : ''}`}
                    >
                        <div className="lottery-ticket-content">
                            <div className="lottery-ticket-owner">
                                <span
                                    className={`lottery-resident lottery-resident--${residentTone(ticket.actorId)}`}
                                    aria-hidden="true"
                                >
                                    {ticket.actorName.slice(0, 1)}
                                </span>
                                <span className="truncate font-bold text-slate-800">{ticket.actorName}</span>

                                {tierLabel ? (
                                    <span className="lottery-ticket-prize">
                                        <Sparkles className="h-3 w-3" aria-hidden="true"/>
                                        {tierLabel}
                                    </span>
                                ) : (
                                    <span className="lottery-ticket-state">
                                        {ticket.matches === null ? '待开奖' : '未中奖'}
                                    </span>
                                )}
                            </div>

                            <div className="lottery-ticket-numbers">
                                <LotteryBalls values={ticket.numbers} winning={winning}/>
                            </div>

                            <div className="lottery-ticket-footer">
                                <span>{lotteryDate(ticket.createdAt)}</span>
                                {ticket.matches === null ? (
                                    <span><Check className="h-3 w-3 text-emerald-600"/>已出票</span>
                                ) : (
                                    <span>命中 {ticket.matches} 个数字</span>
                                )}
                            </div>
                        </div>

                        <div className="lottery-ticket-stub" aria-label={`票价 ${round?.rules.ticketPrice || '5'} 金币`}>
                            <Ticket className="h-3.5 w-3.5 text-amber-600"/>
                            <strong>{lotteryMoney(round?.rules.ticketPrice || '5')}</strong>
                            <span>金币</span>
                            <i className="lottery-barcode" aria-hidden="true"/>
                        </div>
                    </article>;
                })}
            </div>
        )}

        <LotteryPagination page={page} total={tickets.total} change={onPage}/>
    </section>;
}
