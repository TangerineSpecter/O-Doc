import {useState, useEffect, useRef} from 'react';
import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    Bot,
    Compass,
    FlaskConical,
    GitBranch,
    HelpCircle,
    Info,
    RotateCw,
    SlidersHorizontal,
    Sparkles,
    UtensilsCrossed,
} from 'lucide-react';
import WorldDialog from './WorldDialog';
import {decisionProcessGuides} from './decisionProcessGuides';
import type {DecisionGuideKind} from './decisionProcessGuides';

// 场景主题配置
const SCENE_THEME = {
    cooking: {
        icon: UtensilsCrossed,
        name: '料理工坊',
        accentBg: 'bg-orange-500/10 text-orange-600',
        badge: 'bg-orange-50 text-orange-700 border-orange-200',
    },
    alchemy: {
        icon: FlaskConical,
        name: '魔药工坊',
        accentBg: 'bg-purple-500/10 text-purple-600',
        badge: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    exploration: {
        icon: Compass,
        name: '迷宫远征',
        accentBg: 'bg-emerald-500/10 text-emerald-600',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
};

export function DecisionProcessInfo({kind}: {kind: DecisionGuideKind}) {
    const [open, setOpen] = useState(false);
    const guide = decisionProcessGuides[kind];
    const theme = SCENE_THEME[kind];
    const SceneIcon = theme.icon;

    const hasLoop = kind === 'cooking' || kind === 'alchemy';

    // 动态回环箭头坐标计算（从步骤 4 里的“多轮回路”框引出，指回到步骤 2）
    const containerRef = useRef<HTMLDivElement>(null);
    const step2Ref = useRef<HTMLDivElement>(null);
    const loopBoxRef = useRef<HTMLDivElement>(null);
    const [loopArrow, setLoopArrow] = useState<{d: string; labelX: number; labelY: number} | null>(null);

    useEffect(() => {
        if (!open || !hasLoop) {
            setLoopArrow(null);
            return;
        }

        const computeArrow = () => {
            if (!containerRef.current || !step2Ref.current || !loopBoxRef.current) return;
            const cRect = containerRef.current.getBoundingClientRect();
            const s2Rect = step2Ref.current.getBoundingClientRect();
            const lBoxRect = loopBoxRef.current.getBoundingClientRect();

            // 双轨模式下：步骤 2 在右轨上方，步骤 4 多轮回路框在左轨下方
            const isDualTrack = s2Rect.left > lBoxRect.left + 50;

            if (isDualTrack) {
                // 起点：多轮回路框右侧中心
                const startX = lBoxRect.right - cRect.left;
                const startY = lBoxRect.top - cRect.top + lBoxRect.height / 2;
                // 终点：步骤 2 卡片左侧中下部
                const endX = s2Rect.left - cRect.left - 2;
                const endY = s2Rect.bottom - cRect.top - 24;

                // 弯曲控制点形成优雅弧线跨轨回指
                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;
                const d = `M ${startX} ${startY} C ${midX - 12} ${startY - 24}, ${midX + 12} ${endY + 24}, ${endX} ${endY}`;
                setLoopArrow({d, labelX: midX, labelY: midY});
            } else {
                // 单列模式下：从多轮回路框右侧绕弧线回指
                const rightOffset = Math.max(lBoxRect.right, s2Rect.right) - cRect.left + 10;
                const startX = lBoxRect.right - cRect.left;
                const startY = lBoxRect.top - cRect.top + lBoxRect.height / 2;
                const endX = s2Rect.right - cRect.left + 4;
                const endY = s2Rect.bottom - cRect.top - 16;

                const d = `M ${startX} ${startY} C ${rightOffset + 24} ${startY}, ${rightOffset + 24} ${endY}, ${endX} ${endY}`;
                setLoopArrow({d, labelX: rightOffset + 12, labelY: (startY + endY) / 2});
            }
        };

        const timer = setTimeout(computeArrow, 60);
        window.addEventListener('resize', computeArrow);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', computeArrow);
        };
    }, [open, hasLoop]);

    // 辅助函数：根据步骤序号和业务类型获取流向标注
    const getFlowConnector = (index: number) => {
        if (hasLoop) {
            switch (index) {
                case 0:
                    return {dir: 'to-right', text: '筛选出合法候选池 -> 交付模型决策'};
                case 1:
                    return {dir: 'down', text: '选定菜谱或配方'};
                case 2:
                    return {dir: 'to-left', text: '完成份数与用料策略 -> 提交系统模拟扣除'};
                case 3:
                    return {dir: 'down', text: '更新模拟库存，准备锁定'};
                case 4:
                    return {dir: 'down', text: '预留锁定完成'};
                case 5:
                    return {dir: 'finish', text: '执行结算完毕'};
                default:
                    return null;
            }
        } else {
            // exploration
            switch (index) {
                case 0:
                    return {dir: 'to-right', text: '准入核验通过 -> 交付模型筹备'};
                case 1:
                    return {dir: 'down', text: '选定地点与时长'};
                case 2:
                    return {dir: 'down', text: '配置干粮战术'};
                case 3:
                    return {dir: 'down', text: '配比红蓝药剂'};
                case 4:
                    return {dir: 'to-left', text: '整装完成 -> 提交系统装载'};
                case 5:
                    return {dir: 'finish', text: '补充特调药水，启程'};
                default:
                    return null;
            }
        }
    };

    return (
        <>
            <button
                type="button"
                aria-label={`查看${guide.title}`}
                title={guide.title}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
            >
                <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>

            {open && (
                <WorldDialog
                    title={guide.title}
                    description="按当前实现说明 · 模型自主决策与系统判断分开标注（双轨泳道图）"
                    onClose={() => setOpen(false)}
                    size="wide"
                >
                    <div className="space-y-4 text-xs text-slate-600">
                        {/* 顶部场景导读与双轨总览 Banner */}
                        <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/50 p-4 shadow-2xs">
                            <div className="flex items-start gap-3.5">
                                <div
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${theme.accentBg}`}
                                >
                                    <SceneIcon className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-800 text-xs">
                                            {theme.name}
                                        </span>
                                        <span className="text-slate-400 text-[11px]">·</span>
                                        <span className="text-slate-500 text-[11px] font-medium">{guide.subtitle}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-700 leading-relaxed font-medium">
                                        {guide.introduction}
                                    </p>
                                    {kind === 'exploration' && <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">
                                        冒险页可查看 HP / MP 下次恢复倒计时及预计回满时间；满血满蓝后停止恢复刷新。
                                    </p>}
                                </div>
                            </div>

                            {/* 双轨泳道图例标头 */}
                            <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="flex items-center gap-2 rounded-xl bg-sky-50/70 border border-sky-100 px-3 py-2 text-sky-900">
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sky-200/70 text-sky-800">
                                        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold text-xs flex items-center justify-between">
                                            <span>系统轨道 (System Track)</span>
                                            <span className="text-[10px] text-sky-700 font-normal">规则·核验·结算</span>
                                        </div>
                                        <p className="text-[10px] text-sky-700/80 truncate">
                                            背包准入过滤、模拟扣减、计划锁定与定星原子结算
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 rounded-xl bg-amber-50/70 border border-amber-100 px-3 py-2 text-amber-900">
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-200/70 text-amber-800">
                                        <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold text-xs flex items-center justify-between">
                                            <span>模型轨道 (Model Decision Track)</span>
                                            <span className="text-[10px] text-amber-700 font-normal">性格·偏好·策略</span>
                                        </div>
                                        <p className="text-[10px] text-amber-700/80 truncate">
                                            结合居民性格偏好挑选目标、份数配比与战术风格
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 核心双轨流程图谱 */}
                        <div
                            ref={containerRef}
                            className="relative rounded-2xl border border-slate-200/80 bg-slate-50/40 p-3 sm:p-5 overflow-visible"
                        >
                            {/* 桌面端居中轨道分割虚线 */}
                            <div
                                className="hidden sm:block absolute left-1/2 top-4 bottom-4 w-px border-r border-dashed border-slate-300 -translate-x-1/2"
                                aria-hidden="true"
                            />

                            {/* 一个箭头直接指过去：从步骤 4 里的“多轮回路”框引出，平滑跨轨指回到步骤 2 */}
                            {loopArrow && (
                                <>
                                    <svg
                                        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible z-20"
                                        aria-hidden="true"
                                    >
                                        <defs>
                                            <marker
                                                id="loopback-arrowhead"
                                                viewBox="0 0 10 10"
                                                refX="7"
                                                refY="5"
                                                markerWidth="7"
                                                markerHeight="7"
                                                orient="auto"
                                            >
                                                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#6366f1" />
                                            </marker>
                                        </defs>
                                        {/* 白色描边底层，防止遮挡背景文字 */}
                                        <path
                                            d={loopArrow.d}
                                            fill="none"
                                            stroke="white"
                                            strokeWidth="5"
                                            strokeLinecap="round"
                                        />
                                        {/* 主体回路箭头线 */}
                                        <path
                                            d={loopArrow.d}
                                            fill="none"
                                            stroke="#6366f1"
                                            strokeWidth="2.5"
                                            strokeDasharray="6 3.5"
                                            markerEnd="url(#loopback-arrowhead)"
                                        />
                                    </svg>
                                    {/* 箭头上悬挂的简洁流向小标签 */}
                                    <div
                                        className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-indigo-200 bg-white/95 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 shadow-sm flex items-center gap-1"
                                        style={{left: `${loopArrow.labelX}px`, top: `${loopArrow.labelY}px`}}
                                    >
                                        <RotateCw className="h-3 w-3 shrink-0 text-indigo-600" aria-hidden="true" />
                                        <span>{'继续制作 -> 回到步骤 2 (最多3轮)'}</span>
                                    </div>
                                </>
                            )}

                            <div className="space-y-4">
                                {guide.steps.map((step, index) => {
                                    const isModel = step.role === '模型选择';
                                    const flow = getFlowConnector(index);

                                    // 节点专属配色
                                    const cardTheme = isModel
                                        ? {
                                              border: 'border-amber-200/90 hover:border-amber-300',
                                              badge: 'text-amber-800 bg-amber-50 border-amber-200',
                                              node: 'bg-amber-500 text-white shadow-2xs',
                                              chip: 'bg-amber-50/70 text-amber-900 border-amber-100',
                                              colAlign: 'sm:col-start-2 sm:col-end-3',
                                              roleName: '模型自主选择',
                                          }
                                        : {
                                              border: step.role === '系统执行'
                                                  ? 'border-emerald-200/90 hover:border-emerald-300'
                                                  : 'border-sky-200/90 hover:border-sky-300',
                                              badge: step.role === '系统执行'
                                                  ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                                                  : 'text-sky-800 bg-sky-50 border-sky-200',
                                              node: step.role === '系统执行'
                                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                                  : 'bg-sky-600 text-white shadow-2xs',
                                              chip: 'bg-slate-100 text-slate-700 border-slate-200/70',
                                              colAlign: 'sm:col-start-1 sm:col-end-2',
                                              roleName: step.role,
                                          };

                                    return (
                                        <div key={step.title} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                                            {/* 卡片放置在对应轨道的列 */}
                                            <div
                                                ref={index === 1 ? step2Ref : undefined}
                                                className={`${cardTheme.colAlign} relative`}
                                            >
                                                <div
                                                    className={`rounded-2xl border bg-white p-3.5 sm:p-4 shadow-2xs transition-all duration-150 hover:shadow-xs ${cardTheme.border}`}
                                                >
                                                    {/* 头部：步骤序号 + 标题 + 角色微徽章 */}
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-mono font-bold ${cardTheme.node}`}
                                                            >
                                                                {index + 1}
                                                            </span>
                                                            <h3 className="font-bold text-slate-800 text-[13px] sm:text-sm leading-snug">
                                                                {step.title}
                                                            </h3>
                                                        </div>
                                                        <span
                                                            className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold ${cardTheme.badge}`}
                                                        >
                                                            {cardTheme.roleName}
                                                        </span>
                                                    </div>

                                                    {/* 核心参数胶囊 */}
                                                    {step.chips && step.chips.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {step.chips.map(chip => (
                                                                <span
                                                                    key={chip}
                                                                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium border leading-tight ${cardTheme.chip}`}
                                                                >
                                                                    {chip}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* 正文说明 */}
                                                    <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                                                        {step.detail}
                                                    </p>

                                                    {/* 提示框 1：分支拦截提示 */}
                                                    {step.branch && (
                                                        <div className="mt-2.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-2 text-[11px] text-amber-900 flex items-start gap-1.5">
                                                            <GitBranch
                                                                className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600"
                                                                aria-hidden="true"
                                                            />
                                                            <div className="min-w-0 flex-1 leading-snug">
                                                                <strong className="font-semibold text-amber-800 mr-1">
                                                                    分支拦截：
                                                                </strong>
                                                                <span>{step.branch}</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* 提示框 2：多轮回路提示（箭头从这里引出指向步骤 2） */}
                                                    {index === 3 && guide.loop && (
                                                        <div
                                                            ref={loopBoxRef}
                                                            className="mt-2 rounded-xl border border-indigo-200/90 bg-indigo-50/80 p-2 text-[11px] text-indigo-950 flex items-start gap-1.5 shadow-2xs"
                                                        >
                                                            <RotateCw
                                                                className="h-3.5 w-3.5 shrink-0 mt-0.5 text-indigo-600"
                                                                aria-hidden="true"
                                                            />
                                                            <div className="min-w-0 flex-1 leading-snug">
                                                                <strong className="font-semibold text-indigo-900 mr-1">
                                                                    多轮回路：
                                                                </strong>
                                                                <span>{guide.loop}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 流向衔接指示符 */}
                                                {flow && (
                                                    <div className="mt-2 flex items-center justify-center">
                                                        <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs">
                                                            {flow.dir === 'to-right' && <ArrowRight className="h-3 w-3 text-orange-600 shrink-0" aria-hidden="true" />}
                                                            {flow.dir === 'to-left' && <ArrowLeft className="h-3 w-3 text-sky-600 shrink-0" aria-hidden="true" />}
                                                            {flow.dir === 'down' && <ArrowDown className="h-3 w-3 text-slate-500 shrink-0" aria-hidden="true" />}
                                                            <span>{flow.text}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 底部常见疑问与底层规则 (FAQ) */}
                        {guide.notes.length > 0 && (
                            <div className="pt-2">
                                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold mb-2">
                                    <HelpCircle className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                                    <span>核心规则机制与常见疑问</span>
                                </div>
                                <div className="grid gap-2.5 sm:grid-cols-2">
                                    {guide.notes.map(note => (
                                        <div
                                            key={note.title}
                                            className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs hover:border-slate-300 transition-colors"
                                        >
                                            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" aria-hidden="true" />
                                                <span>{note.title}</span>
                                            </h4>
                                            <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                                                {note.detail}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 同时说明当前执行边界与尚待接入的流程。 */}
                        {guide.upcoming && (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-2.5 text-[11px] text-slate-400 leading-relaxed flex items-start gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
                                <div>
                                    <span className="font-medium text-slate-600 mr-1">当前边界与待接入：</span>
                                    <span>{guide.upcoming.replace(/^待接入：/, '')}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </WorldDialog>
            )}
        </>
    );
}
