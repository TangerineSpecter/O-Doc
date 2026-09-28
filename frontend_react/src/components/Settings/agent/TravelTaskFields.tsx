import {Select} from '@/components/common/Select';
import {Checkbox} from '@/components/common/Checkbox';
import type {MCPServerConfig} from '@/types/api/setting';
import type {TravelConfig} from '@/types/api/travel';
import {usePostScopeOptions} from './usePostScopeOptions';

export function TravelTaskFields({value, servers, onChange}: {value: TravelConfig; servers: MCPServerConfig[]; onChange: (value: TravelConfig) => void}) {
    const {collections, categories, loading, error, retry} = usePostScopeOptions(true);
    const searches = servers.filter(server => server.enabled && (server.tools || []).some(tool => ['tavily_search', 'tavily-search'].includes(tool.name) && tool.enabled !== false));
    const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20';
    return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div><h3 className="text-sm font-semibold text-slate-800">旅行与日记</h3><p className="mt-1 text-xs leading-5 text-slate-500">随机提供目的地，允许不去。途中暂停其他世界任务，返程写日记；图片稍后补入。</p></div>
        {loading ? <p className="text-sm text-slate-500">正在加载配置…</p> : error ? <p className="text-sm text-red-600">{error}<button type="button" onClick={retry} className="ml-2 text-orange-600">重试</button></p> : <>
            <label className="block space-y-2 text-sm text-slate-700"><span>输出文集</span><Select menuPortal value={value.collectionId} options={collections.map(c => ({value: c.id, label: c.name}))} onChange={collectionId => onChange({...value, collectionId})} placeholder="选择可管理的 Agent 文集"/></label>
            <label className="block space-y-2 text-sm text-slate-700"><span>旅行分类</span><Select menuPortal value={value.categoryId} options={categories.filter(c => c.workflowKind === 'travel').map(c => ({value: c.id, label: c.name}))} onChange={categoryId => onChange({...value, categoryId})} placeholder="选择旅行工作流分类"/></label>
            <label className="block space-y-2 text-sm text-slate-700"><span>地方资料搜索</span><Select menuPortal value={value.searchServerId} options={searches.map(s => ({value: s.id, label: s.name}))} onChange={searchServerId => onChange({...value, searchServerId})} placeholder="选择 Tavily 搜索服务"/></label>
        </>}
        <div className="grid gap-4 sm:grid-cols-3">{([{key: 'nodeMinutes', label: '节点间隔（分钟）', min: 1, max: 60}, {key: 'recentCities', label: '避开最近城市数', min: 0, max: 30}, {key: 'energyCost', label: '整趟体力消费', min: 0, max: 100}] as const).map(field => <label key={field.key} className="space-y-2 text-xs text-slate-600"><span>{field.label}</span><input className={inputClass} type="number" min={field.min} max={field.max} value={value[field.key]} onChange={e => onChange({...value, [field.key]: Number(e.target.value)})}/></label>)}</div>
        <Checkbox checked={value.photoEnabled} onChange={photoEnabled => onChange({...value, photoEnabled})} label="默认生成一张旅行场景照"/>
        <p className="text-xs leading-5 text-slate-500">参与 Agent 需配置模型并绑定旅行游记 Skill。配图另需绑定旅行场景照 Skill 和生图 MCP；缺少配图条件仍发布文字日记，并通知人工处理。</p>
    </section>;
}
