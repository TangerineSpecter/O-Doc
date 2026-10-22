import {ArrowUpRight, Check, Ticket} from 'lucide-react';
import type {LotteryPage, LotteryRound, LotteryTicket} from '../../types/api/lottery';
import {LotteryBalls, LotteryPagination} from './LotteryUi';
import {lotteryDate, lotteryMoney} from './lotteryPresentation';

const residentTone = (id: string) => {
    const hash = Array.from(id).reduce((value, char) => value + char.charCodeAt(0), 0);
    return ['orange', 'sage', 'blue', 'rose'][hash % 4];
};

export function LotteryTickets({tickets, round, page, onPage}: {
    tickets: LotteryPage<LotteryTicket>; round: LotteryRound | null; page: number; onPage: (page: number) => void;
}) {
    const winning = round?.result.winningNumbers || [];
    return <section className="lottery-tickets-section" aria-label="本期彩票">
        <div className="lottery-section-heading">
            <div><Ticket className="h-4 w-4"/><h3>居民的幸运票</h3><span className="lottery-count-badge">{tickets.total} 张</span></div>
            <span className="lottery-section-hint">{round?.status === 'settled' ? '号码已揭晓' : '每张票，都是一份期待'}</span>
        </div>
        {!tickets.items.length ? <div className="lottery-tickets-empty">
            <div className="lottery-empty-tickets" aria-hidden="true"><Ticket strokeWidth={1}/><Ticket strokeWidth={1}/></div>
            <h4>还没有居民购票</h4><p>等日程安排一次小小的幸运之约。</p>
        </div> : <div className="lottery-ticket-grid scrollbar-hide">
            {tickets.items.map(ticket => {
                const tier = ticket.matches === null || !ticket.matches ? '' : ['未中奖', '三等奖', '二等奖', '一等奖'][ticket.matches];
                return <article key={ticket.id} className={`lottery-ticket ${tier ? 'lottery-ticket--winner' : ''}`}>
                    <div className="lottery-ticket-content">
                        <div className="lottery-ticket-owner">
                            <span className={`lottery-resident lottery-resident--${residentTone(ticket.actorId)}`} aria-hidden="true">{ticket.actorName.slice(0, 1)}</span>
                            <span className="truncate font-semibold text-slate-700">{ticket.actorName}</span>
                            {tier ? <span className="lottery-ticket-prize"><ArrowUpRight className="h-3 w-3" aria-hidden="true"/>{tier}</span> :
                                <span className="lottery-ticket-state">{ticket.matches === null ? '待开奖' : '未中奖'}</span>}
                        </div>
                        <div className="lottery-ticket-numbers"><LotteryBalls values={ticket.numbers} winning={winning}/></div>
                        <div className="lottery-ticket-footer">
                            <span>{lotteryDate(ticket.createdAt)}</span>
                            {ticket.matches === null ? <span><Check className="h-3 w-3"/>已出票</span> : <span>命中 {ticket.matches} 个数字</span>}
                        </div>
                    </div>
                    <div className="lottery-ticket-stub" aria-label={`票价${round?.rules.ticketPrice || '5'}金币`}>
                        <Ticket className="h-3.5 w-3.5"/>
                        <strong>{lotteryMoney(round?.rules.ticketPrice || '5')}</strong><span>金币</span>
                        <i className="lottery-barcode" aria-hidden="true"/>
                    </div>
                </article>;
            })}
        </div>}
        <LotteryPagination page={page} total={tickets.total} change={onPage}/>
    </section>;
}

