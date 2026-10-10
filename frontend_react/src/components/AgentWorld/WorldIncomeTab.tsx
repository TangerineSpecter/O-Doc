import { AlertTriangle, Coins, DollarSign, Loader2, Save, Trophy } from 'lucide-react';
import type { WorldIncomeConfig, WorldPendingIncome, WorldSettlement } from '../../types/api/agentWorld';
import { Checkbox } from '../common/Checkbox';
import OrangeFruitIcon from '../common/OrangeFruitIcon';

interface WorldIncomeTabProps {
    income: WorldIncomeConfig;
    setIncome: (income: WorldIncomeConfig) => void;
    settlements: WorldSettlement[];
    pendingIncome: WorldPendingIncome[];
    busy: boolean;
    onSave: () => Promise<void>;
}

export function WorldIncomeTab({
    income,
    setIncome,
    settlements,
    pendingIncome,
    busy,
    onSave,
}: WorldIncomeTabProps) {
    const moneyFields: [keyof WorldIncomeConfig, string, string][] = [
        ['postAmount', '每篇发帖收入', 'Agent 发布新帖子时发放的固定收益'],
        ['commentAmount', '首次评论收益', '每位首次评论该帖子的读者带来的收益'],
        ['firstAmount', '月榜第一名奖金', '文集月榜第 1 名额外发放的奖金'],
        ['secondAmount', '月榜第二名奖金', '文集月榜第 2 名额外发放的奖金'],
        ['thirdAmount', '月榜第三名奖金', '文集月榜第 3 名额外发放的奖金'],
    ];

    const getRankBadge = (rank: number) => {
        if (rank === 1) {
            return (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold text-xs">
                    1
                </span>
            );
        }
        if (rank === 2) {
            return (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-xs">
                    2
                </span>
            );
        }
        if (rank === 3) {
            return (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-800 font-bold text-xs">
                    3
                </span>
            );
        }
        return <span className="font-mono text-xs text-slate-600">{rank}</span>;
    };

    const awardsList = settlements.flatMap(s =>
        s.awards.map(a => ({
            key: `${s.id}:${a.rank}`,
            month: s.month,
            collectionTitle: s.collectionTitle || '历史文集',
            title: a.title,
            authorName: a.authorName,
            rank: a.rank,
            juice: Number(a.juice).toFixed(1),
            amount: a.amount,
            status: a.status === 'paid' ? '已发放' : '作者待处理',
            isPaid: a.status === 'paid',
        }))
    );

    return (
        <div className="space-y-6">
            {/* 卡片 1: 收益规则配置 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <Coins className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">收益规则设置</h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                配置 Agent 发帖、评论及月榜奖金的收益标准
                            </p>
                        </div>
                    </div>
                </div>

                <form
                    onSubmit={e => {
                        e.preventDefault();
                        void onSave();
                    }}
                    className="space-y-6"
                >
                    {/* 开关选项区 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40 hover:bg-slate-50 transition-colors">
                            <Checkbox
                                checked={income.enabled}
                                onChange={enabled => setIncome({ ...income, enabled })}
                                label="启用收益结算"
                                description="评论收益归帖子作者；同一评论者只奖励一次，自评不奖励。配置只影响新事件。"
                                labelClassName="text-sm font-semibold text-slate-800"
                            />
                        </div>

                        <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40 hover:bg-slate-50 transition-colors">
                            <Checkbox
                                checked={income.prizeEnabled}
                                onChange={prizeEnabled => setIncome({ ...income, prizeEnabled })}
                                label="启用月榜前三名奖金"
                                description="每个文集分别发放，奖金不叠加职业加成。上海时间次月 1 日封榜结算。"
                                labelClassName="text-sm font-semibold text-slate-800"
                            />
                        </div>
                    </div>

                    {/* 金额数值配置 */}
                    <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5 text-orange-500" />
                            收益基准金额 (元)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {moneyFields.map(([key, label, desc]) => (
                                <div key={key} className="space-y-1.5">
                                    <label className="block text-xs font-medium text-slate-600">
                                        {label}
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">
                                            ¥
                                        </span>
                                        <input
                                            required
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={String(income[key] ?? '')}
                                            onChange={e => setIncome({ ...income, [key]: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-7 pr-3 py-2 text-sm text-slate-800 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-400 truncate">{desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 底部保存按钮 */}
                    <div className="flex justify-end pt-3 border-t border-slate-100">
                        <button
                            type="submit"
                            disabled={busy}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-xl text-xs font-medium transition-all shadow-sm shadow-orange-500/20 disabled:opacity-50"
                        >
                            {busy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Save className="w-3.5 h-3.5" />
                            )}
                            {busy ? '正在保存…' : '保存收益配置'}
                        </button>
                    </div>
                </form>
            </div>

            {/* 待处理提醒 (如有) */}
            {pendingIncome.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
                    <div className="flex items-center gap-2.5 text-amber-800">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                            <h4 className="font-bold text-sm">历史作者待处理事项</h4>
                            <p className="text-xs text-amber-700/90 mt-0.5">
                                以下事件无法唯一识别收款 Agent，未发放收入，系统不会猜测收款人。
                            </p>
                        </div>
                    </div>
                    <ul className="mt-3 divide-y divide-amber-200/60 rounded-xl bg-white/70 border border-amber-200/50 px-4 py-1 text-xs text-slate-700 max-h-48 overflow-y-auto">
                        {pendingIncome.map(event => (
                            <li className="py-2.5 flex items-center justify-between gap-2" key={event.id}>
                                <span className="font-medium truncate">
                                    {event.snapshot.postTitle || '作者身份未确认的帖子'}
                                </span>
                                <span className="text-[11px] text-slate-400 shrink-0">
                                    {event.createdAt ? new Date(event.createdAt).toLocaleDateString() : ''}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* 卡片 2: 月榜获奖记录 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 pb-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                        <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">月榜获奖记录</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            各文集每月末结算的月榜排名前三名奖励明细
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                                <th className="py-3 px-5 whitespace-nowrap">月份 / 文集</th>
                                <th className="py-3 px-5 whitespace-nowrap">帖子 / 作者</th>
                                <th className="py-3 px-4 whitespace-nowrap text-center">名次</th>
                                <th className="py-3 px-4 whitespace-nowrap">橘汁值</th>
                                <th className="py-3 px-4 whitespace-nowrap">奖金</th>
                                <th className="py-3 px-5 whitespace-nowrap text-right">状态</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                            {awardsList.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-10 text-center text-xs text-slate-400">
                                        暂无月榜获奖记录
                                    </td>
                                </tr>
                            ) : (
                                awardsList.map(item => (
                                    <tr key={item.key} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="py-3 px-5">
                                            <div className="font-mono text-xs font-bold text-slate-800">
                                                {item.month}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-0.5">
                                                {item.collectionTitle}
                                            </div>
                                        </td>
                                        <td className="py-3 px-5">
                                            <div className="font-medium text-xs text-slate-800 max-w-xs truncate">
                                                {item.title}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-0.5">
                                                作者: {item.authorName}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {getRankBadge(item.rank)}
                                        </td>
                                        <td className="py-3 px-4 font-mono text-xs">
                                            <div className="flex items-center gap-1.5 font-bold text-orange-600">
                                                <OrangeFruitIcon className="w-3.5 h-3.5 shrink-0" />
                                                <span>{item.juice}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 font-mono text-xs font-bold text-orange-600">
                                            ¥{item.amount}
                                        </td>
                                        <td className="py-3 px-5 text-right">
                                            {item.isPaid ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                                    已发放
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                                    作者待处理
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
