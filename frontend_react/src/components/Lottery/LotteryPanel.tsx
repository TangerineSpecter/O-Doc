import {AlertCircle, Coins, Info, Loader2, Medal, RefreshCw, Sparkles, Ticket, Trophy} from 'lucide-react';
import {Select} from '../common/Select';
import {useLottery} from '../../hooks/useLottery';
import {DecisionProcessInfo} from '../AgentWorld/DecisionProcessInfo';
import type {LotteryAward, LotteryConfig} from '../../types/api/lottery';
import {LotteryHero} from './LotteryHero';
import {LotteryTickets} from './LotteryTickets';
import {LotteryPagination} from './LotteryUi';
import {lotteryDate, lotteryTier} from './lotteryPresentation';
import './lottery.css';

function LotteryPrizes() {
    const prizes = [
        {tier: '一等奖', title: '共享累积奖池', detail: '全中3个数字，按中奖票数分配', Icon: Trophy, tone: 'gold', tag: '奖池奖励'},
        {tier: '二等奖', title: '50', detail: '命中2个数字，每人每期限领一次', Icon: Medal, tone: 'sage', tag: '固定奖励'},
        {tier: '三等奖', title: '20', detail: '命中1个数字，每人每期限领一次', Icon: Sparkles, tone: 'rose', tag: '固定奖励'},
    ];
    return <section aria-label="奖项规则" className="lottery-prizes">
        {prizes.map(({tier, title, detail, Icon, tone, tag}) => <div key={tier} className={`lottery-prize lottery-prize--${tone}`}>
            <div className="lottery-prize-icon"><Icon className="h-5 w-5" strokeWidth={1.65}/></div>
            <div className="min-w-0 flex-1">
                <div className="lottery-prize-heading"><h3>{tier}</h3><span>{tag}</span></div>
                <p className="lottery-prize-value">{title}{tier !== '一等奖' && <small>金币</small>}</p>
                <p className="lottery-prize-detail">{detail}</p>
            </div>
        </div>)}
    </section>;
}

function LotteryWinners({awards}: {awards: LotteryAward[]}) {
    return <section className="lottery-winners" aria-label="中奖明细">
        <div className="lottery-section-heading"><div><Trophy className="h-4 w-4"/><h3>中奖明细</h3></div><span className="lottery-section-hint">好运已经到账</span></div>
        {awards.length ? <div className="lottery-winner-grid">
            {awards.map(award => <div key={`${award.actorId}-${award.tier}`} className="lottery-winner">
                <span className={`lottery-winner-medal lottery-winner-medal--${award.tier}`}><Medal className="h-5 w-5"/></span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-700">{award.actorName}<span className="ml-2 font-normal text-slate-400">{lotteryTier(award.tier)}</span></p>
                    <p className="mt-1 text-[10px] text-slate-400">{award.tier === 1 ? `${award.winningTickets}张中奖票 · 按票数分配` : '系统固定奖励'}</p></div>
                <span className="lottery-winner-amount">+{award.amount}<small>金币</small></span>
            </div>)}
        </div> : <p className="lottery-no-winner">本期暂无中奖居民，奖池继续结转。下一期，再试一次好运。</p>}
    </section>;
}

function LotterySettings({config, saving, toggle}: {config: LotteryConfig; saving: boolean; toggle: (enabled: boolean) => Promise<void>}) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h4 className="text-sm font-bold text-slate-800">购票能力{config.enabled ? '已开启' : '未开启'}</h4>
                <p className="mt-2 text-xs leading-6 text-slate-500">居民通过生活日程自主购票。请在决策设置中启用数量与选号场景。停用购买不会撤销已售彩票的兑奖权。</p></div>
            <button type="button" disabled={saving} onClick={() => void toggle(!config.enabled)} className="shrink-0 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50">
                {saving ? '保存中…' : config.enabled ? '停用购票' : '启用大乐透'}
            </button>
        </div>
        {config.firstDrawAt && <p className="mt-4 text-xs text-slate-400">首次开奖：{lotteryDate(config.firstDrawAt)}（北京时间）；以后每隔三天20:00开奖。</p>}
    </section>;
}

export function LotteryPanel({settingsOnly = false}: {settingsOnly?: boolean}) {
    const state = useLottery();
    const {data, loading, error} = state;
    const round = data?.overview.round || null;
    const config = data?.overview.config;
    const options = [{value: '', label: '当前期次'}, ...(data?.history.items || [])
        .filter(item => item.id !== round?.id || !!state.roundId)
        .map(item => ({value: item.id, label: `第${item.sequence}期 · ${item.status === 'settled' ? '已开奖' : '待开奖'}`}))];

    return <div className="lottery-panel">
        <header className="lottery-toolbar">
            <span className="lottery-brand-icon"><Ticket className="h-5 w-5" strokeWidth={1.7}/></span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1"><h2 className="lottery-brand-title">居民彩票站</h2><DecisionProcessInfo kind="lottery"/></div>
                <p className="lottery-brand-caption">三天一期，攒一点小期待。</p>
            </div>
            {!settingsOnly && data && <div className="lottery-round-select"><Select menuPortal={true} value={state.roundId} onChange={state.chooseRound} options={options}/></div>}
            <button aria-label="刷新大乐透" type="button" onClick={state.reload} className="lottery-refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? 'motion-safe:animate-spin' : ''}`}/>
            </button>
        </header>
        {error && <div role="alert" className="lottery-alert"><AlertCircle className="h-4 w-4 shrink-0"/><span className="flex-1">{error}</span><button type="button" onClick={state.reload}>重试</button></div>}
        {!data && loading && <div role="status" className="lottery-loading"><Loader2 className="h-5 w-5 animate-spin"/><span>正在整理本期的幸运票…</span></div>}
        {settingsOnly && config && <LotterySettings config={config} saving={state.saving} toggle={state.toggle}/>}
        {!settingsOnly && data && <>
            {!config?.enabled && <div className="lottery-notice"><Info className="h-3.5 w-3.5 shrink-0"/><p>购票能力未开启，请在世界管理 → 大乐透中启用。已有彩票仍会在世界运行时结算。</p></div>}
            <LotteryHero round={round}/>
            <LotteryPagination page={state.historyPage} total={data.history.total} change={state.setHistoryPage} label="期次"/>
            <LotteryPrizes/>
            {round?.status === 'settled' && <LotteryWinners awards={round.result.awards || []}/>}
            <LotteryTickets tickets={data.tickets} round={round} page={state.ticketPage} onPage={state.setTicketPage}/>
            <footer className="lottery-fine-print"><Coins className="h-3.5 w-3.5 shrink-0"/><p>每张5金币，每人每期最多10张；相同组合可重复购买。二、三等奖不扣奖池，不同彩票可跨档领奖。</p></footer>
        </>}
    </div>;
}
