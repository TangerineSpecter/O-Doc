import {useState, type ReactNode} from 'react';
import {Image, Info, MessageCircle, Sparkles} from 'lucide-react';
import {Checkbox} from '../common/Checkbox';
import {Select} from '../common/Select';
import {useSocialSettings} from '../../hooks/useSocialSettings';
import type {SocialSettings as Settings} from '../../types/api/social';
import SocialResidents from './SocialResidents';
import WorldOrbitLoader from './WorldOrbitLoader';

const actions: [keyof Settings, string, string][] = [
    ['publishEnabled', '自主发布', '日终可以分享今天的经历'],
    ['readEnabled', '阅读朋友圈', '可以看看近期动态、点赞或评论'],
    ['replyEnabled', '自主回应', '收到评论后可以回复、暂缓或忽略'],
];
const quotas: [keyof Settings, string, number][] = [['dailyReplies', '每日回应', 20], ['dailyMoments', '每日发布', 10], ['readLimit', '每次阅读', 5]];

function Field({label, children}: {label: string; children: ReactNode}) {
    return <div className="space-y-1.5"><p className="text-[11px] font-medium text-slate-500">{label}</p>{children}</div>;
}

export default function SocialSettings({onSaved, onCancel}: {onSaved?: () => void; onCancel?: () => void}) {
    const state = useSocialSettings(onSaved);
    const [info, setInfo] = useState(false);
    const {config, settings, actor, update, busy} = state;
    if (!config || !settings) return <div className="flex min-h-0 flex-1 items-center justify-center">{state.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : <WorldOrbitLoader title="正在读取社交配置" subtitle="整理参与居民与交流偏好"/>}</div>;
    const number = (key: keyof Settings, max: number) => <input aria-label={key === 'dailyImages' ? '每日生成新图' : quotas.find(q => q[0] === key)?.[1]} type="number" min={0} max={max} value={Number(settings[key])} disabled={busy} onChange={e => update(key, Number(e.target.value))} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/>;
    return <div className="world-dialog-content-enter space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-2">
            <div className="min-w-[200px] sm:w-64"><Select value={actor} onChange={state.setActor} disabled={busy} menuPortal options={[{value: '', label: '世界默认设置'}, ...config.agents.map(a => ({value: a.id, label: `${a.name} · 独立设置`}))]}/></div>
            {actor ? <button disabled={busy} type="button" onClick={state.reset} className="text-xs text-orange-600">恢复继承世界默认</button> : <p className="text-[11px] text-slate-400">世界默认对参与居民生效，也可为每位居民单独调整。</p>}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
                <section className="relative rounded-2xl border border-orange-100 bg-orange-50/50 p-3">
                    <div className="flex items-center justify-between gap-2"><Checkbox checked={settings.enabled} onChange={v => update('enabled', v)} disabled={busy} label="自动社交" labelClassName="font-bold text-slate-800"/><button type="button" aria-label="自动社交说明" aria-expanded={info} onClick={() => setInfo(v => !v)} title="自动安排社交机会，居民仍可以选择休息。" className="rounded-full p-1 text-orange-400 outline-none hover:bg-orange-100 focus-visible:ring-2 focus-visible:ring-orange-300"><Info className="h-4 w-4"/></button></div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500">{settings.enabled ? '允许系统安排社交机会，居民自己决定做什么。' : '当前关闭，居民不会自动发动态、阅读或回应。'}</p>
                    {info && <div role="note" className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-orange-200 bg-white p-4 text-[11px] leading-5 text-slate-600 shadow-lg">世界运行时，为选中的居民安排空闲回应和每天一次日终社交；居民可以发动态、阅读、回应或休息。不会每次都互动。仍遵守活动时间、体力和忙碌状态，用户手动发布不受影响。角色设置须在世界自动社交开启后生效。</div>}
                </section>
                {!actor ? <SocialResidents agents={config.agents} selected={config.settings.agentIds} onChange={v => update('agentIds', v)} disabled={busy}/> : <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-500"><p className="font-semibold text-slate-800">{config.agents.find(a => a.id === actor)?.name}的社交习惯</p><p className="mt-2">这里只调整这位居民。参与名单在世界默认设置中管理。</p><p className="mt-2 text-orange-600">{config.settings.agentIds.includes(actor) ? '已加入参与名单' : '尚未加入参与名单'}</p></section>}
            </div>
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-800"><MessageCircle className="h-4 w-4 text-orange-500"/>行为与节奏</h3>
                <div className="space-y-2">{actions.map(([key, label, description]) => <Checkbox key={key} checked={Boolean(settings[key])} onChange={v => update(key, v)} disabled={busy} label={label} description={description} className="w-full rounded-xl bg-slate-50 px-3 py-2"/>)}</div>
                <Field label="收到评论后，什么时候处理"><Select value={settings.replyMode} onChange={v => update('replyMode', v)} disabled={busy} menuPortal options={[{value: 'idle_daily', label: '空闲处理＋日终兜底'}, {value: 'daily', label: '仅日终处理'}]}/></Field>
                <div className="grid grid-cols-3 gap-2">{quotas.map(([key, label, max]) => <Field key={key} label={label}>{number(key, max)}</Field>)}</div>
                <p className="text-[11px] leading-5 text-slate-400">以上是机会和额度上限。一次回应最多一条回复，日终最多选择一种行为；不回复也是一种选择。</p>
            </section>
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-800"><Image className="h-4 w-4 text-orange-500"/>配图选择</h3>
                <Checkbox checked={settings.imageEnabled} onChange={v => update('imageEnabled', v)} disabled={busy} label="允许自主配图" description="开启只是允许，居民仍可选择纯文字" className="w-full rounded-xl bg-slate-50 px-3 py-2"/>
                <p className="text-[11px] leading-5 text-slate-500">{settings.imageEnabled ? '居民可以不配图、引用已有图片，或生成新图。' : '关闭后，Agent 朋友圈只发布文字。'}用户手动上传图片不受影响。</p>
                <Field label="生成新图使用的模型"><Select value={settings.imageModelId} onChange={v => update('imageModelId', v)} disabled={busy || !settings.imageEnabled} menuPortal options={[{value: '', label: '使用系统默认模型'}, ...state.models.map(m => ({value: m.id, label: m.displayName || m.name}))]}/></Field>
                <div className="grid grid-cols-2 gap-2"><Field label="图片比例"><Select value={settings.imageAspectRatio} onChange={v => update('imageAspectRatio', v)} disabled={busy || !settings.imageEnabled} menuPortal options={['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'].map(v => ({value: v, label: v}))}/></Field><Field label="分辨率"><Select value={settings.imageSize} onChange={v => update('imageSize', v)} disabled={busy || !settings.imageEnabled} menuPortal options={['1K', '2K', '4K'].map(v => ({value: v, label: v}))}/></Field></div>
                <Field label="每天最多生成的新图片">{number('dailyImages', 9)}</Field>
                <p className="text-[11px] leading-5 text-slate-400">生成新图使用真实服务额度。额度为 0 时可引用已有图片；图片失败仍保留文字动态。</p>
            </section>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400"><Sparkles className="h-3.5 w-3.5 shrink-0"/>{state.error ? <span role="alert" className="text-red-600">{state.error}</span> : '开启的是自主选择的机会，每天不必发布或回复。'}</div>
            <div className="flex gap-2">{onCancel && <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-500">取消</button>}<button type="button" disabled={busy} onClick={() => void state.save()} className="rounded-xl bg-orange-500 px-5 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">{busy ? '保存中…' : '保存设置'}</button></div>
        </footer>
    </div>;
}
