import {useState} from 'react';
import {Select} from '@/components/common/Select';
import WorldDialog from '@/components/AgentWorld/WorldDialog';
import {usePortraitImage} from '@/components/Combat/useLoadoutPortrait';
import {usePortraitReference} from '@/components/Combat/usePortraitReference';
import {usePortraitUpload} from '@/components/Combat/usePortraitUpload';
import type {TournamentDetail} from '@/types/api/tournament';
import {useTournamentArt} from './useTournamentArt';

export function TournamentArtDialog({event, onClose}: {event: TournamentDetail; onClose: () => void}) {
    const [model, setModel] = useState('');
    const [moment, setMoment] = useState('');
    const [extra, setExtra] = useState('');
    const [preview, setPreview] = useState<'saved' | 'generated' | 'uploaded'>('saved');
    const art = useTournamentArt(event.id, model);
    const upload = usePortraitUpload();
    const style = usePortraitReference();
    const generated = art.data?.task?.status === 'succeeded' ? art.data.task : null;
    const assetId = preview === 'uploaded' ? upload.uploaded?.assetId : preview === 'generated' ? generated?.assetId : art.data?.assetId;
    const image = usePortraitImage(assetId);
    const names = Object.fromEntries(event.roster.map(row => [row.id, row.name]));
    const locked = art.busy || art.active || upload.busy || style.busy;
    return <WorldDialog title="决战纪念图" description="用决赛战报记录擂台上的一刻" size="wide" onClose={onClose}>
        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
            <div>
                <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                    {image.url ? <img src={image.url} alt="决战纪念图预览" className="h-auto max-h-[55vh] w-full object-contain"/> : <p className="p-8 text-center text-sm text-slate-500">还没有配图，上传图片或生成一张吧</p>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {art.data?.assetId && <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setPreview('saved')}>当前配图</button>}
                    {generated?.assetId && <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setPreview('generated')}>生成结果</button>}
                    {upload.uploaded && <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setPreview('uploaded')}>上传图片</button>}
                    {preview === 'generated' && generated?.taskId && <button type="button" disabled={locked} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" onClick={() => void art.apply({taskId: generated.taskId})}>应用生成图</button>}
                    {preview === 'uploaded' && upload.uploaded && <button type="button" disabled={locked} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" onClick={() => void art.apply({assetId: upload.uploaded!.assetId})}>应用上传图</button>}
                </div>
            </div>
            <div className="space-y-4 text-sm">
                {!art.data && !art.error && <p>正在读取配图…</p>}
                <label className="block font-medium text-slate-700">上传决战图片<input type="file" accept="image/png,image/jpeg,image/webp" disabled={locked} className="mt-2 block w-full text-xs" onChange={e => {const file = e.target.files?.[0]; if (file) void upload.upload(file).then(value => {if (value) setPreview('uploaded');}); e.currentTarget.value = '';}}/></label>
                {art.data && <>
                    <div><p className="mb-2 font-medium text-slate-700">生图模型</p><Select value={model || art.data.options.modelId || ''} options={art.data.options.models} onChange={setModel} menuPortal placeholder="请选择模型"/></div>
                    <div><p className="mb-2 font-medium text-slate-700">战斗瞬间</p><Select value={moment} options={[{value: '', label: '自动选择高伤害瞬间'}, ...art.data.moments.map(item => ({value: item.id, label: `第 ${item.round} 回合 · ${names[item.actor] || item.actor} → ${names[item.target] || item.target} · ${item.action} ${item.damage} 伤害${item.critical ? ' · 暴击' : ''}`}))]} onChange={setMoment} menuPortal/></div>
                    <label className="block font-medium text-slate-700">画风参考图（可选）<input type="file" accept="image/png,image/jpeg,image/webp" disabled={locked} className="mt-2 block w-full text-xs" onChange={e => {const file = e.target.files?.[0]; if (file) void style.upload(file); e.currentTarget.value = '';}}/>{style.reference && <span className="mt-1 block text-xs text-slate-500">{style.reference.name} <button type="button" onClick={style.clear} className="text-orange-600">移除</button></span>}</label>
                    <label className="block font-medium text-slate-700">补充画面要求<textarea value={extra} onChange={e => setExtra(e.target.value)} maxLength={1000} className="mt-2 block w-full resize-none rounded-lg border border-slate-200 p-2" rows={3}/></label>
                    <p className="text-xs leading-5 text-slate-500">画面使用比赛时的职业、装备和所选行动。人物参考使用当前头像或全身图，历史外貌可能已变化。</p>
                    {!art.data.canGenerate && <p className="text-amber-700">这届没有可用的决赛战报，请上传图片。</p>}
                    {art.data.options.message && <p className="text-amber-700">{art.data.options.message}</p>}
                    {art.data.task && <p className="text-slate-600">{art.active ? '正在绘制，请稍候…' : art.data.task.message || (generated ? '生成完成，可预览并应用' : `生成状态：${art.data.task.status}`)}</p>}
                    {art.data.task?.status === 'submission_unknown' && <div className="text-xs text-amber-700"><p>服务商可能已经收到请求。放弃等待后重新生成可能产生额外费用。</p><button type="button" className="mt-2 underline" disabled={locked} onClick={() => void art.release()}>放弃本次等待</button></div>}
                    <button type="button" disabled={locked || art.data.task?.status === 'submission_unknown' || !art.data.canGenerate || !art.data.options.supportsReferenceImages} className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={() => {void art.generate(moment, extra, style.reference?.id); setPreview('generated');}}>生成决战图</button>
                </>}
                {(art.error || upload.error || style.error || image.error) && <p role="alert" className="text-red-600">{art.error || upload.error || style.error || image.error}</p>}
            </div>
        </div>
    </WorldDialog>;
}
