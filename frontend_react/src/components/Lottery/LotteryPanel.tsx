import {useOpenTaskAllocation} from '../../hooks/useOpenTaskAllocation';
import {AlertCircle, Coins, Info, Loader2, Medal, RefreshCw, Sparkles, Trophy} from 'lucide-react';
import {Select} from '../common/Select';
import {useLottery} from '../../hooks/useLottery';
import {DecisionProcessInfo} from '../AgentWorld/DecisionProcessInfo';
import type {LotteryAward, LotteryRules} from '../../types/api/lottery';
import {LotteryHero} from './LotteryHero';
import {LotteryTickets} from './LotteryTickets';
import {LotteryPagination} from './LotteryUi';
import {lotteryMoney, lotteryTier} from './lotteryPresentation';
import {LotteryIcon} from './LotteryIcon';
import './lottery.css';

function LotteryPrizes({rules}: {rules: LotteryRules}) {
    const prizes = [
        {
            tier: '一等奖',
            title: '共享累积奖池',
            detail: `全中 3 个数字；所有一等奖票平分整个奖池（含 ${lotteryMoney(rules.subsidy)} 金币起步补贴），无人中奖全额滚存结转`,
            Icon: Trophy,
            tone: 'gold',
            tag: '奖池全额平分',
        },
        {
            tier: '二等奖',
            title: lotteryMoney(rules.secondPrize),
            detail: '命中任意 2 个数字；系统固定奖励，每人每期至多领一次，不扣一等奖奖池',
            Icon: Medal,
            tone: 'sage',
            tag: '固定奖励',
        },
        {
            tier: '三等奖',
            title: lotteryMoney(rules.thirdPrize),
            detail: '命中任意 1 个数字；系统固定奖励，每人每期至多领一次，不同彩票可跨档领奖',
            Icon: Sparkles,
            tone: 'rose',
            tag: '固定奖励',
        },
    ];

    return <section aria-label="奖项规则" className="lottery-prizes">
        {prizes.map(({tier, title, detail, Icon, tone, tag}) => (
            <div key={tier} className={`lottery-prize lottery-prize--${tone}`}>
                <div className="lottery-prize-punch lottery-prize-punch--left" aria-hidden="true" />
                <div className="lottery-prize-icon">
                    <Icon className="h-5 w-5" strokeWidth={1.8}/>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="lottery-prize-heading">
                        <h3>{tier}</h3>
                        <span>{tag}</span>
                    </div>
                    <p className="lottery-prize-value">
                        {title}
                        {tier !== '一等奖' && <small>金币</small>}
                    </p>
                    <p className="lottery-prize-detail">{detail}</p>
                </div>
                <div className="lottery-prize-punch lottery-prize-punch--right" aria-hidden="true" />
            </div>
        ))}
    </section>;
}

function LotteryWinners({awards}: {awards: LotteryAward[]}) {
    return <section className="lottery-winners" aria-label="中奖明细">
        <div className="lottery-section-heading">
            <div>
                <Trophy className="h-4 w-4 text-amber-500"/>
                <h3>本期中奖公示</h3>
            </div>
            <span className="lottery-section-hint">好运已经结算到账</span>
        </div>

        {awards.length ? (
            <div className="lottery-winner-grid">
                {awards.map(award => (
                    <div key={`${award.actorId}-${award.tier}`} className="lottery-winner">
                        <span className={`lottery-winner-medal lottery-winner-medal--${award.tier}`}>
                            <Medal className="h-4 w-4"/>
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-slate-800">
                                {award.actorName}
                                <span className="ml-2 font-normal text-slate-400">
                                    {lotteryTier(award.tier)}
                                </span>
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-400">
                                {award.tier === 1
                                    ? `${award.winningTickets} 张中奖票 · 平分奖池`
                                    : '系统固定奖励'}
                            </p>
                        </div>
                        <span className="lottery-winner-amount">
                            +{award.amount}
                            <small>金币</small>
                        </span>
                    </div>
                ))}
            </div>
        ) : (
            <p className="lottery-no-winner">
                本期暂无居民中得一等奖，奖池资金已全部滚存结转至下一期。下一期好运加倍！
            </p>
        )}
    </section>;
}

export function LotteryPanel({residents}: {residents: {id: string; avatar?: string}[]}) {
    const openTasks = useOpenTaskAllocation();
    const state = useLottery();
    const {data, loading, error} = state;
    const round = data?.overview.round || null;
    const config = data?.overview.config;
    const options = [
        {value: '', label: '当前期次'},
        ...(data?.history.items || [])
            .filter(item => item.id !== round?.id || Boolean(state.roundId))
            .map(item => ({
                value: item.id,
                label: `第${item.sequence}期 · ${item.status === 'settled' ? '已开奖' : '待开奖'}`,
            })),
    ];

    return <div className="lottery-panel">
        <header className="lottery-toolbar">
            <span className="lottery-brand-icon">
                <LotteryIcon className="h-5 w-5"/>
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <h2 className="lottery-brand-title">居民彩票站</h2>
                    <DecisionProcessInfo kind="lottery"/>
                </div>
                <p className="lottery-brand-caption">三天一期，攒一点小期待。</p>
            </div>

            {data && (
                <div className="lottery-round-select">
                    <Select
                        menuPortal={true}
                        value={state.roundId}
                        onChange={state.chooseRound}
                        options={options}
                    />
                </div>
            )}

            <button
                aria-label="刷新大乐透"
                type="button"
                onClick={state.reload}
                className="lottery-refresh"
                title="刷新当期彩票与开奖状态"
            >
                <RefreshCw className={`h-4 w-4 ${loading ? 'motion-safe:animate-spin' : ''}`}/>
            </button>
        </header>

        {error && (
            <div role="alert" className="lottery-alert">
                <AlertCircle className="h-4 w-4 shrink-0"/>
                <span className="flex-1">{error}</span>
                <button type="button" onClick={state.reload}>重试</button>
            </div>
        )}

        {!data && loading && (
            <div role="status" className="lottery-loading">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500"/>
                <span>正在整理本期的幸运票…</span>
            </div>
        )}

        {data && <>
            {!config?.enabled && (
                <div className="lottery-notice">
                    <Info className="h-4 w-4 shrink-0 text-amber-600"/>
                    <span className="flex-1">
                        购票能力尚未开启，居民暂不会生成购票生活日程。
                    </span>
                    <button
                        type="button"
                        disabled={state.saving}
                        onClick={openTasks}
                        className="lottery-notice-action"
                    >
                        <Sparkles className="h-3 w-3"/>
                        前往任务分配
                    </button>
                </div>
            )}

            <LotteryHero
                round={round}
                config={config}
                onEnable={openTasks}
                saving={state.saving}
            />

            <LotteryPagination
                page={state.historyPage}
                total={data.history.total}
                change={state.setHistoryPage}
                label="期次"
            />

            <LotteryPrizes rules={round?.rules || data.overview.config.rules}/>

            {round?.status === 'settled' && (
                <LotteryWinners awards={round.result.awards || []}/>
            )}

            <LotteryTickets
                residents={residents}
                tickets={data.tickets}
                round={round}
                page={state.ticketPage}
                onPage={state.setTicketPage}
            />

            <footer className="lottery-fine-print">
                <Coins className="h-3.5 w-3.5 shrink-0 text-amber-500"/>
                <p>
                    每张 {lotteryMoney((round?.rules || data.overview.config.rules).ticketPrice)} 金币，每人每期最多 10 张；相同组合可重复购买。二、三等奖由系统额外发放，不扣一等奖奖池，不同彩票可跨档领奖。
                </p>
            </footer>
        </>}
    </div>;
}
