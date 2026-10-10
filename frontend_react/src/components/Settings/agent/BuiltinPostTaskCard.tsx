import type {ElementType} from 'react';
import {
    MessageSquare,
    Swords,
    Send,
    Compass,
    TrendingUp,
    ShoppingBag,
    Sprout,
    Settings2,
    Play,
    BookOpen,
} from 'lucide-react';
import type {AgentTaskConfig} from '@/types/api/setting';

interface Props {
    task: AgentTaskConfig;
    agentNames: string[];
    running: boolean;
    progress?: AgentTaskConfig['worldProgress'];
    onConfigure: () => void;
    onToggle: () => void;
    onRun: () => void;
    onPreview?: () => void;
}

const activityTheme: Record<
    string,
    {
        icon: ElementType;
        color: string;
    }
> = {
    exploration: {icon: Swords, color: 'bg-orange-50 text-orange-600 border-orange-100'},
    cooking: {icon: BookOpen, color: 'bg-orange-50 text-orange-600 border-orange-100'},
    investment: {
        icon: TrendingUp,
        color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    },
    market: {
        icon: ShoppingBag,
        color: 'bg-amber-50 text-amber-600 border-amber-100',
    },
    farm: {
        icon: Sprout,
        color: 'bg-lime-50 text-lime-700 border-lime-100',
    },
    travel: {
        icon: Compass,
        color: 'bg-cyan-50 text-cyan-600 border-cyan-100',
    },
    post_publish: {
        icon: Send,
        color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    },
    post_interaction: {
        icon: MessageSquare,
        color: 'bg-blue-50 text-blue-600 border-blue-100',
    },
};

export function BuiltinPostTaskCard({
    task,
    running,
    onConfigure,
    onToggle,
    onRun,
    onPreview,
}: Props) {
    const configured = Boolean(task.id);
    const theme = (task.taskKind && activityTheme[task.taskKind]) || {
        icon: BookOpen,
        color: 'bg-orange-50 text-orange-600 border-orange-100',
    };
    const Icon = theme.icon;

    const description =
        task.taskKind === 'exploration' ? '自主准备装备与药剂，持续探索地牢；冒险面板可观察战斗、掉落与成长，自动探索须单独开启。' : task.taskKind === 'cooking' ? '用自己的食材制作美食，获得厨艺经验并解锁高级食谱；成品可在市场出售。' : task.taskKind === 'investment'
            ? '查询市场新闻和行业，按需分析股票，自主买卖或观望。持仓与收益可在股票投资查看。'
            : task.taskKind === 'market'
              ? '自主进入市场，购买农资与动物、出售产物或上架商品。进入消耗体力并自由交易。'
              : task.taskKind === 'farm'
                ? '自主种植、养殖、照料和升级，在像素农场中观察居民日常。'
                : task.taskKind === 'travel'
                  ? '自主选择目的地，体验景点、美食与旅途趣事，购买纪念品并留下图文日记。'
                  : task.taskKind === 'post_publish'
                    ? '根据角色和分类素材规则自主选题，搜索核实后发布；没有合适内容可跳过。'
                    : '随机阅读范围内自己未评论过的其他居民帖子，根据角色性格评论并打分。';

    return (
        <div className="group relative flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-all duration-200 hover:border-orange-300 hover:shadow-xs">
            {/* 顶部标题与状态 */}
            <div>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${theme.color}`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                        </span>
                        <h4 className="truncate text-xs font-bold text-slate-800">{task.name}</h4>
                    </div>

                    <button
                        type="button"
                        onClick={configured ? onToggle : onConfigure}
                        className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-normal transition-colors ${
                            task.enabled
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                        title={
                            configured
                                ? task.enabled
                                    ? '点击停用能力'
                                    : '点击启用能力'
                                : '先配置活动规则，再启用能力'
                        }
                    >
                        {task.enabled && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        )}
                        <span>{task.enabled ? '启用中' : '已关闭'}</span>
                    </button>
                </div>

                {/* 描述文案（紧凑 2 行） */}
                <p
                    className="mt-2 text-[11px] leading-relaxed text-slate-500 line-clamp-2"
                    title={description}
                >
                    {description}
                </p>
            </div>

            {/* 底部操作工具栏 */}
            <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-2.5">
                {configured && onPreview && (
                    <button
                        type="button"
                        onClick={onPreview}
                        disabled={running}
                        className="inline-flex shrink-0 whitespace-nowrap items-center rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-orange-50 hover:text-orange-600 disabled:opacity-40"
                    >
                        预览
                    </button>
                )}
                {configured && (
                    <button
                        type="button"
                        onClick={onRun}
                        disabled={running}
                        className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-2xs transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-40"
                    >
                        <Play className={`h-3 w-3 ${running ? 'animate-spin text-orange-500' : ''}`} />
                        <span>{running ? '执行中' : '立即执行'}</span>
                    </button>
                )}
                <button
                    type="button"
                    onClick={onConfigure}
                    className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md bg-orange-500 px-2.5 py-1 text-[11px] font-medium text-white shadow-2xs transition-all hover:bg-orange-600 active:scale-95"
                >
                    <Settings2 className="h-3 w-3" />
                    <span>配置</span>
                </button>
            </div>
        </div>
    );
}
