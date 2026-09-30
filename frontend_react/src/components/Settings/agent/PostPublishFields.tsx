import {Select} from '@/components/common/Select';
import {Checkbox} from '@/components/common/Checkbox';
import type {AgentPublishConfig, PublishCategoryRule} from '@/types/api/agentPublish';
import type {MCPServerConfig} from '@/types/api/setting';
import {usePostScopeOptions} from './usePostScopeOptions';
import {newPublishRule} from './publishDefaults';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20';
interface Props {value: AgentPublishConfig; onChange: (value: AgentPublishConfig) => void; servers: MCPServerConfig[]}
export function PostPublishFields({value, onChange, servers}: Props) {
    const {collections, categories, loading, error, retry} = usePostScopeOptions(true);
    const patchRule = (id: string, patch: Partial<PublishCategoryRule>) => onChange({...value, rules: value.rules.map(rule => rule.categoryId === id ? {...rule, ...patch} : rule)});
    const searchServers = servers.filter(s => s.enabled && s.transport === 'streamableHttp' && s.tools?.some(t => ['tavily_search', 'tavily-search'].includes(t.name) && t.enabled !== false));
    return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div><h4 className="text-sm font-semibold text-slate-900">发帖范围与素材</h4><p className="mt-1 text-xs leading-relaxed text-slate-500">Agent 在允许分类内自主选题。旅行由独立工作流发布，持仓复盘将在投资系统上线后开放。</p></div>
        {loading ? <p className="text-xs text-slate-500">正在加载文集和分类…</p> : error ? <p role="alert" className="text-xs text-red-600">{error}<button type="button" onClick={retry} className="ml-2 shrink-0 whitespace-nowrap text-orange-600">重试</button></p> : <>
            <label className="block space-y-2 text-sm font-semibold text-slate-700"><span>输出文集</span><Select value={value.collectionId} menuPortal options={collections.map(c => ({value: c.id, label: c.name}))} onChange={collectionId => onChange({...value, collectionId})} placeholder="选择可管理的 Agent 文集"/></label>
            <label className="block space-y-2 text-sm font-semibold text-slate-700"><span>搜索服务</span><Select value={value.searchServerId} menuPortal options={searchServers.map(s => ({value: s.id, label: s.name}))} onChange={searchServerId => onChange({...value, searchServerId})} placeholder="选择启用的 Tavily 搜索服务"/></label>
            {!searchServers.length && <p className="text-xs text-amber-700">请先在 MCP 设置启用并刷新 Tavily 搜索工具。</p>}
            <label className="block space-y-2 text-sm font-semibold text-slate-700"><span>允许分类</span><Select value="" menuPortal options={categories.filter(c => c.workflowKind !== 'travel' && !['旅行', '旅游', '旅行分享', '旅行日记', 'travel'].includes(c.name.toLowerCase()) && !value.rules.some(r => r.categoryId === c.id)).map(c => ({value: c.id, label: c.name}))} onChange={id => onChange({...value, rules: [...value.rules, newPublishRule(id)]})} placeholder="添加分类（至少一个）"/></label>
            {!value.rules.length && <p className="text-xs text-slate-500">尚未选择分类。新分类不会自动加入。</p>}
            {value.rules.map(rule => <div key={rule.categoryId} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3"><h5 className="text-sm font-semibold text-slate-800">{categories.find(c => c.id === rule.categoryId)?.name || '已失效分类'}</h5><button type="button" className="shrink-0 whitespace-nowrap text-xs text-slate-500 hover:text-red-600" onClick={() => onChange({...value, rules: value.rules.filter(r => r.categoryId !== rule.categoryId)})}>移除</button></div>
                <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-200 bg-white p-1">{(['news', 'topic'] as const).map(mode => <button type="button" key={mode} aria-pressed={rule.modes.includes(mode)} onClick={() => patchRule(rule.categoryId, {modes: rule.modes.includes(mode) ? rule.modes.filter(m => m !== mode) : [...rule.modes, mode]})} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs ${rule.modes.includes(mode) ? 'bg-orange-50 text-orange-700' : 'text-slate-500'}`}>{mode === 'news' ? '新闻解读' : '专题分享'}</button>)}</div>
                <label className="block space-y-1 text-xs text-slate-600"><span>关注主题</span><textarea className={inputClass} rows={2} value={rule.topics} placeholder="如 AI、机器人、开源软件；留空参考分类描述和角色兴趣" onChange={e => patchRule(rule.categoryId, {topics: e.target.value})}/></label>
                <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs text-slate-600"><span>新闻时间范围（天）</span><input className={inputClass} type="number" min={1} max={365} value={rule.newsDays} onChange={e => patchRule(rule.categoryId, {newsDays: Number(e.target.value)})}/></label><label className="space-y-1 text-xs text-slate-600"><span>关注地区</span><input className={inputClass} value={rule.region} onChange={e => patchRule(rule.categoryId, {region: e.target.value})}/></label></div>
                <label className="block space-y-1 text-xs text-slate-600"><span>排除主题</span><input className={inputClass} value={rule.excludedTopics} placeholder="如无来源传闻、营销软文" onChange={e => patchRule(rule.categoryId, {excludedTopics: e.target.value})}/></label>
                <p className="text-xs text-slate-500">专题资料不限时间；新闻按配置时间范围检索，接口未返回发布时间时不影响采用。</p>
            </div>)}
        </>}
        <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm text-slate-700"><span>每位 Agent 发帖冷却（小时）</span><input className={inputClass} type="number" min={1} max={720} value={value.cooldownHours} onChange={e => onChange({...value, cooldownHours: Number(e.target.value)})}/></label><label className="space-y-2 text-sm text-slate-700"><span>未读积压检查篇数</span><input className={inputClass} type="number" min={1} max={100} disabled={!value.unreadEnabled} value={value.unreadCount} onChange={e => onChange({...value, unreadCount: Number(e.target.value)})}/></label></div>
        <Checkbox checked={value.unreadEnabled} onChange={unreadEnabled => onChange({...value, unreadEnabled})} label="最近指定篇数全部未读时暂停发帖"/>
        <p className="text-xs text-slate-500">成功发帖消耗20点体力，每次机会最多一篇；没有合适素材可以跳过。第一版不配图。</p>
    </section>;
}
