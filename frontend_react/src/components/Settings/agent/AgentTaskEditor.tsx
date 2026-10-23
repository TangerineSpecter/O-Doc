import {createPortal} from 'react-dom';
import {BellRing, CheckCircle2, Repeat2, Sparkles, X} from 'lucide-react';
import type {
    AgentConfig,
    AgentTaskConfig,
    AgentTaskExecutionMode,
    AgentTaskFollowupAction,
    AgentTaskNotifyPlatform,
    AgentTaskScheduleType,
    AIModel,
    MCPServerConfig,
} from '../../../types/api/setting';
import {SettingsSelect, type SettingsSelectOption} from '../SettingsSelect';
import {ProfessionBadge} from '../../AgentWorld/ProfessionBadge';
import {PromptEditorModal} from '../../common/PromptEditorModal';
import {InvestmentTaskFields} from './InvestmentTaskFields';
import {MarketTaskFields} from './MarketTaskFields';
import {TravelTaskFields} from './TravelTaskFields';
import {PostPublishFields} from './PostPublishFields';
import {PostInteractionScopeFields} from './PostInteractionScopeFields';
import {McpTaskScopeFields} from './McpTaskScopeFields';
import {TaskModelSelect} from './TaskModelSelect';
import {RandomTaskScheduleFields} from './RandomTaskScheduleFields';
import {emptyTravelConfig} from '../../../types/api/travel';
import {emptyPublishConfig} from './publishDefaults';
import {isSystemTaskKind, taskWeekdayOptions as weekdayOptions} from './agentTaskDraft';
import {useAgentTaskEditor} from './useAgentTaskEditor';

interface AgentTaskEditorProps {
    task?: AgentTaskConfig;
    agents: AgentConfig[];
    archivedAgents: AgentConfig[];
    mcpServers: MCPServerConfig[];
    modelOptions: SettingsSelectOption<string>[];
    imageModels: (AIModel & {providerName: string})[];
    onSave: (task: Partial<AgentTaskConfig>) => Promise<boolean>;
    onClose: () => void;
}

export function AgentTaskEditor({task, agents, archivedAgents, mcpServers, modelOptions, imageModels, onSave, onClose}: AgentTaskEditorProps) {
    const allResidents = [...agents, ...archivedAgents];
    const {draft: taskForm, setDraft: setTaskForm, submit: handleTaskSubmit, toggleAgent: toggleTaskAgent} = useAgentTaskEditor({
        task, defaultAgentId: agents[0]?.id || '', residents: allResidents, onSave, onClose,
    });
    const isSystemTask = isSystemTaskKind(taskForm.taskKind);
    const isInvestmentTask = taskForm.taskKind === 'investment';
    const isMarketTask = taskForm.taskKind === 'market';
    const isExplorationTask = taskForm.taskKind === 'exploration';
    const isCookingTask = taskForm.taskKind === 'cooking';
    const isBlacksmithTask = taskForm.taskKind === 'blacksmith';
    const isAlchemyTask = taskForm.taskKind === 'alchemy';
    const isFarmTask = taskForm.taskKind === 'farm';
    const isTravelTask = taskForm.taskKind === 'travel';
    const isPublishTask = taskForm.taskKind === 'post_publish';
    const isManualTask = taskForm.trigger === '手动执行';
    const taskAgentOptions = [...agents, ...archivedAgents.filter(agent => agent.id === taskForm.followupAgent)]
        .map(agent => ({value: agent.id, label: agent.name + (agent.archived ? '（已归档）' : ''), disabled: !!agent.archived}));
    const executionModeOptions: SettingsSelectOption<AgentTaskExecutionMode>[] = [
        {value: 'parallel', label: '并行执行', description: '多个 Agent 同时执行，适合独立产出和快速对比'},
        {value: 'serial', label: '串行执行', description: taskForm.scheduleMode === 'random' && taskForm.trigger === '定时任务'
            ? '按分配次数轮流执行，每次由一个 Agent 独立完成'
            : '按选择顺序执行，后一个 Agent 会参考前一个结果'},
    ];
    const taskTriggerOptions: SettingsSelectOption<string>[] = [
        {value: '定时任务', label: '定时任务'},
        {value: '手动执行', label: '手动执行'},
        {value: '编辑器触发', label: '编辑器触发'},
        {value: 'Memos 触发', label: 'Memos 触发'},
    ];
    const notifyPlatformOptions: SettingsSelectOption<AgentTaskNotifyPlatform>[] = [
        {value: 'feishu', label: '飞书机器人', description: '通过飞书自定义机器人 Webhook 发送文本消息'},
    ];
    const followupActionOptions: SettingsSelectOption<AgentTaskFollowupAction>[] = [
        {value: 'review', label: '评价最新作品', description: '仅当来源 Agent 本次成功发布作品时触发'},
        {value: 'continue_research', label: '继续调查', description: '基于来源 Agent 的输出寻找新证据和遗漏'},
    ];
    const scheduleTypeOptions: SettingsSelectOption<AgentTaskScheduleType>[] = [
        {value: 'daily', label: '每天'},
        {value: 'weekly', label: '每周'},
        {value: 'monthly', label: '每月'},
        {value: 'interval', label: '间隔'},
    ];
    const monthDayOptions: SettingsSelectOption<string>[] = Array.from({length: 31}, (_, index) => {
        const value = String(index + 1);
        return {value, label: `${value} 日`};
    });

    return createPortal(
        <div data-modal-scroll-lock className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">{isSystemTask ? '配置系统任务' : taskForm.id ? '编辑任务' : '新建自定义任务'}</h3>
                        <p className="mt-1 text-xs text-slate-500">{isSystemTask ? '配置活动规则、数据来源与偏好；参与居民沿用生活配置，按所属分组安排时间' : '配置 Agent 在什么时机执行什么任务，以及输出到哪里'}</p>
                    </div>
                    <button
                        onClick={() => onClose()}
                        className="p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 rounded-lg"
                    >
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                <div className="max-h-[72vh] space-y-5 overflow-y-auto scrollbar-hide p-6">
                    <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            isSystemTask
                                ? 'border border-orange-200/90 bg-orange-50 text-orange-700 shadow-2xs'
                                : 'border border-slate-200 bg-slate-100 text-slate-600'
                        }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isSystemTask ? 'bg-orange-500' : 'bg-slate-400'}`} />
                            {isSystemTask ? `内置系统任务 · ${taskForm.name}` : '自定义任务'}
                        </span>
                    </div>
                    {isSystemTask && <>
                        <>{isInvestmentTask ? <InvestmentTaskFields value={taskForm.investmentConfig || {}} servers={mcpServers} onChange={investmentConfig => setTaskForm({...taskForm, investmentConfig})}/> : isMarketTask ? <MarketTaskFields value={taskForm.marketConfig || {}} onChange={marketConfig => setTaskForm({...taskForm, marketConfig})}/> : isExplorationTask ? <p className="rounded-2xl bg-orange-50 p-4 text-sm leading-relaxed text-slate-600">居民准备地点、装备与药剂，规则自动推进持续战斗。自动探索由空档活动决策触发，需开启本机自动执行、自动穿插和迷宫探索能力。准备使用有限决策，确定步骤与战斗由系统执行。</p> : isCookingTask ? <p className="rounded-2xl bg-orange-50 p-4 text-sm leading-relaxed text-slate-600">使用居民自己的食材制作美食，一次最多六份；每份消耗食谱规定的体力并获得厨艺经验，成品由市场出售。食谱规则和图片在食谱图鉴维护。</p> : isBlacksmithTask ? <p className="rounded-2xl bg-orange-50 p-4 text-sm leading-relaxed text-slate-600">居民依次选择等级范围、部位和当前职业路线可用类型，消耗自己的迷宫材料打造装备。每件消耗2点体力，不收金币；等级在范围内随机，白/蓝/金概率为70%/25%/5%。每做完一件再决定是否继续，一次最多三件。配方与记录在世界图鉴的铁匠铺查看。</p> : isAlchemyTask ? <p className="rounded-2xl bg-violet-50 p-4 text-sm leading-relaxed text-slate-600">使用背包里的迷宫素材炼制一次性药水，一次最多三道配方、每道五瓶；每瓶消耗一体力并获得炼金经验。药水不在商店出售，探索出发时最多携带五瓶，未用完自动返还。配方与效果在炼金图鉴查看。</p> : isFarmTask ? <p className="rounded-2xl bg-lime-50 p-4 text-sm leading-relaxed text-slate-600">居民自主种植、养殖、照料与升级；种子、饲料、动物购买及产物出售由市场交易任务负责，共用现有余额。每项成功操作消耗2点体力；旅行时暂停经营。启用后赠送四块耕地。农场规则与角色外观可在农场页面配置。</p> : isTravelTask ? <TravelTaskFields value={taskForm.travelConfig || emptyTravelConfig()} servers={mcpServers} imageModels={imageModels} onChange={travelConfig => setTaskForm({...taskForm, travelConfig})}/> : isPublishTask ? <PostPublishFields imageModels={imageModels} value={taskForm.publishConfig || emptyPublishConfig()} servers={mcpServers} onChange={publishConfig => setTaskForm({...taskForm, publishConfig})}/> : <PostInteractionScopeFields collectionIds={taskForm.postCollectionIds || []} categoryIds={taskForm.postCategoryIds || []}
                            onCollectionsChange={postCollectionIds => setTaskForm({...taskForm, postCollectionIds})} onCategoriesChange={postCategoryIds => setTaskForm({...taskForm, postCategoryIds})}/>}</>
                    </>}

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">任务名称</label>
                        <input
                            value={taskForm.name}
                            readOnly={isSystemTask}
                            onChange={event => setTaskForm({...taskForm, name: event.target.value})}
                            placeholder="如：每日科技文章写作"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {!isSystemTask && <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">执行 Agent</label>
                            <div className="max-h-40 space-y-2 overflow-y-auto scrollbar-hide rounded-xl border border-slate-200 bg-slate-50 p-2">
                                {agents.length === 0 ? (
                                    <div className="px-3 py-6 text-center text-xs text-slate-400">暂无可选 Agent</div>
                                ) : [...agents, ...archivedAgents.filter(agent => taskForm.agents.includes(agent.id))].map(agent => {
                                    const selected = taskForm.agents.includes(agent.id);
                                    return (
                                        <button
                                            key={agent.id}
                                            type="button"
                                            onClick={() => toggleTaskAgent(agent.id)}
                                            disabled={!!agent.archived}
                                            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selected ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-100 bg-white text-slate-600 hover:border-orange-100 hover:bg-orange-50/50'}`}
                                        >
                                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-orange-500 bg-orange-500' : 'border-slate-300 bg-white'}`}>
                                                {selected && <CheckCircle2 className="h-3 w-3 text-white"/>}
                                            </span>
                                            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                                                <span className="truncate font-medium">{agent.name}{agent.archived ? '（已归档）' : ''}</span>
                                                {agent.professionName && (
                                                    <ProfessionBadge professionName={agent.professionName} size="xs"/>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>}
                        {!isSystemTask && <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">执行模式</label>
                            <SettingsSelect menuPortal={true}
                                value={taskForm.executionMode}
                                options={executionModeOptions}
                                onChange={executionMode => setTaskForm({...taskForm, executionMode, randomAllocations: {}})}
                                buttonClassName="bg-slate-50"
                            />
                        </div>}
                    </div>

                    {!isSystemTask && taskForm.taskKind === 'custom' && <McpTaskScopeFields
                        value={taskForm.mcpToolScope}
                        selectedAgentIds={taskForm.agents}
                        agents={allResidents}
                        servers={mcpServers}
                        onChange={mcpToolScope => setTaskForm({...taskForm, mcpToolScope})}
                    />}

                    {!isSystemTask && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">触发方式</label>
                            <SettingsSelect menuPortal={true}
                                value={taskForm.trigger}
                                options={taskTriggerOptions}
                                onChange={trigger => setTaskForm({...taskForm, trigger})}
                                buttonClassName="bg-slate-50"
                                showSelectedDescription={false}
                            />
                        </div>
                    </div>}

                    {isBlacksmithTask && <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">打造选择使用“世界管理 → 决策模型”配置的决策连接；唯一合法候选由系统直接确定。</p>}
                    {!isExplorationTask && !isBlacksmithTask && <TaskModelSelect value={taskForm.model} options={modelOptions} onChange={model => setTaskForm({...taskForm, model})}/>}
                    {!isSystemTask && taskForm.trigger === '定时任务' && <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">调度方式</label>
                        <SettingsSelect menuPortal={true} value={taskForm.scheduleMode} options={[{value: 'fixed', label: '固定时间 / 间隔'}, {value: 'random', label: '周期随机'}]} onChange={scheduleMode => setTaskForm({...taskForm, scheduleMode})}/>
                    </div>}
                    {!isSystemTask && taskForm.trigger === '定时任务' && taskForm.scheduleMode === 'random' && <RandomTaskScheduleFields
                        period={taskForm.randomPeriod} count={taskForm.randomCount} mode={taskForm.executionMode}
                        agents={taskForm.agents.map(id => ({id, name: allResidents.find(agent => agent.id === id)?.name || id}))}
                        allocations={taskForm.randomAllocations}
                        onPeriodChange={randomPeriod => setTaskForm({...taskForm, randomPeriod})}
                        onCountChange={randomCount => setTaskForm({...taskForm, randomCount})}
                        onAllocationsChange={randomAllocations => setTaskForm({...taskForm, randomAllocations})}
                    />}
                    {!isSystemTask && !isManualTask && !(taskForm.trigger === '定时任务' && taskForm.scheduleMode === 'random') && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">执行周期</label>
                                <SettingsSelect menuPortal={true}
                                    value={taskForm.scheduleType}
                                    options={scheduleTypeOptions}
                                    onChange={scheduleType => setTaskForm({...taskForm, scheduleType})}
                                    buttonClassName="bg-slate-50"
                                    showSelectedDescription={false}
                                />
                            </div>

                            {taskForm.scheduleType !== 'interval' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">执行时间</label>
                                    <input
                                        type="time"
                                        value={taskForm.scheduleTime}
                                        onChange={event => setTaskForm({...taskForm, scheduleTime: event.target.value})}
                                        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    />
                                </div>
                            )}

                            {taskForm.scheduleType === 'weekly' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">执行星期</label>
                                    <SettingsSelect menuPortal={true}
                                        value={taskForm.scheduleWeekday}
                                        options={weekdayOptions}
                                        onChange={scheduleWeekday => setTaskForm({...taskForm, scheduleWeekday})}
                                        buttonClassName="bg-slate-50"
                                        showSelectedDescription={false}
                                    />
                                </div>
                            )}

                            {taskForm.scheduleType === 'monthly' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">执行日期</label>
                                    <SettingsSelect menuPortal={true}
                                        value={taskForm.scheduleMonthDay}
                                        options={monthDayOptions}
                                        onChange={scheduleMonthDay => setTaskForm({...taskForm, scheduleMonthDay})}
                                        buttonClassName="bg-slate-50"
                                        showSelectedDescription={false}
                                    />
                                </div>
                            )}

                            {taskForm.scheduleType === 'interval' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">间隔分钟</label>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={taskForm.intervalMinutes}
                                        onChange={event => setTaskForm({...taskForm, intervalMinutes: event.target.value})}
                                        placeholder="如：30"
                                        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    />
                                </div>
                            )}

                            {taskForm.scheduleType === 'interval' && (
                                <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-2">从最近一次执行时间开始按固定间隔计算。</p>
                            )}
                        </div>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <label className="flex cursor-pointer items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 rounded-lg bg-white p-2 text-violet-600 shadow-sm ring-1 ring-slate-100">
                                    <BellRing className="h-4 w-4"/>
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-slate-700">任务完成通知</div>
                                    <div className="mt-0.5 text-xs text-slate-500">仅通知当前任务，消息内容包含任务名称</div>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={taskForm.notifyEnabled}
                                onChange={event => setTaskForm({...taskForm, notifyEnabled: event.target.checked})}
                                className="peer sr-only"
                            />
                            <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-violet-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500/20"></span>
                        </label>

                        {taskForm.notifyEnabled && (
                            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">通知平台</label>
                                    <SettingsSelect menuPortal={true}
                                        value={taskForm.notifyPlatform}
                                        options={notifyPlatformOptions}
                                        onChange={notifyPlatform => setTaskForm({...taskForm, notifyPlatform})}
                                        buttonClassName="bg-white"
                                        showSelectedDescription={false}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Webhook 地址</label>
                                    <input
                                        value={taskForm.notifyWebhookUrl}
                                        onChange={event => setTaskForm({...taskForm, notifyWebhookUrl: event.target.value})}
                                        placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    />
                                </div>
                            </div>
                        )}
                    </div>


                    {!isSystemTask && <div className="rounded-xl border border-orange-100 bg-orange-50/50 px-4 py-3">
                        <label className="flex cursor-pointer items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 rounded-lg bg-white p-2 text-orange-600 shadow-sm ring-1 ring-orange-100">
                                    <Repeat2 className="h-4 w-4"/>
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-slate-700">完成后交给另一位 Agent</div>
                                    <div className="mt-0.5 text-xs text-slate-500">自动互评或续查一次，不会继续触发第二层后续任务</div>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={taskForm.followupEnabled}
                                onChange={event => setTaskForm({...taskForm, followupEnabled: event.target.checked})}
                                className="peer sr-only"
                            />
                            <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-orange-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/20"></span>
                        </label>

                        {taskForm.followupEnabled && (
                            <div className="mt-4 space-y-4 border-t border-orange-100 pt-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">后续 Agent</label>
                                        <SettingsSelect menuPortal={true}
                                            value={taskForm.followupAgent}
                                            options={taskAgentOptions.filter(option => !taskForm.agents.includes(option.value))}
                                            onChange={followupAgent => setTaskForm({...taskForm, followupAgent})}
                                            placeholder="选择一位不同的 Agent"
                                            buttonClassName="bg-white"
                                            showSelectedDescription={false}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">后续动作</label>
                                        <SettingsSelect menuPortal={true}
                                            value={taskForm.followupAction}
                                            options={followupActionOptions}
                                            onChange={followupAction => setTaskForm({...taskForm, followupAction})}
                                            buttonClassName="bg-white"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">补充要求 <span className="font-normal text-slate-400">可选</span></label>
                                    <textarea
                                        value={taskForm.followupPrompt}
                                        onChange={event => setTaskForm({...taskForm, followupPrompt: event.target.value})}
                                        rows={3}
                                        placeholder="例如：重点从用户体验和长期价值角度提出不同意见"
                                        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    />
                                </div>
                            </div>
                        )}
                    </div>}

                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <label htmlFor="task-prompt" className="text-sm font-semibold text-slate-700">{isSystemTask ? '补充要求（可选）' : '任务提示词'}</label>
                            <PromptEditorModal
                                name={taskForm.name}
                                subject="任务"
                                value={taskForm.prompt}
                                onChange={prompt => setTaskForm({...taskForm, prompt})}
                            />
                        </div>
                        <textarea
                            id="task-prompt"
                            value={taskForm.prompt}
                            onChange={event => setTaskForm({...taskForm, prompt: event.target.value})}
                            rows={5}
                            placeholder="写清楚这个任务要做什么、参考哪些来源、输出格式和注意事项"
                            className="w-full resize-none px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm leading-6"
                        />
                    </div>

                    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div>
                            <div className="text-sm font-semibold text-slate-700">启用任务</div>
                            <div className="mt-0.5 text-xs text-slate-500">关闭后任务会保留，但不会自动执行</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={taskForm.enabled}
                            onChange={event => setTaskForm({...taskForm, enabled: event.target.checked})}
                            className="peer sr-only"
                        />
                        <span className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-orange-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/20"></span>
                    </label>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                    <button
                        onClick={() => onClose()}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleTaskSubmit}
                        className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 active:bg-orange-700"
                    >
                        <Sparkles className="w-4 h-4"/>
                        {isSystemTask ? '保存配置' : '保存任务'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
