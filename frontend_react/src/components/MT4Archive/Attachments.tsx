import {useState} from 'react';
import {downloadResource, uploadResource} from '../../api/resources';
import {mt4Api} from '../../api/mt4Archive';
import type {MT4Attachment} from '../../types/api/mt4Archive';
import {downloadQuantBlob} from '../../utils/quant';
import {QuantButton} from '../Quant/ui';

export function Attachments({collection, expertId, testId, attachments, reload, imageOnly = false}: {collection: string; expertId: string; testId: string | null; attachments: MT4Attachment[]; reload: () => Promise<void>; imageOnly?: boolean}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const run = async (fn: () => Promise<void>) => {setBusy(true); setError(''); try {await fn();} catch (e) {setError(e instanceof Error ? e.message : '操作失败');} finally {setBusy(false);}};
    return <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-800">{testId ? '报告与图片' : 'EA 资源下载'}</h3><label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{imageOnly ? '补充图片' : '上传附件'}<input type="file" className="hidden" disabled={busy} accept={imageOnly ? 'image/png,image/jpeg,image/gif,image/webp' : undefined} onChange={e => {const file = e.target.files?.[0]; e.target.value = ''; if (file) void run(async () => {const asset = await uploadResource(file, 'quant'); await mt4Api.attach(collection, expertId, testId, asset.id, imageOnly ? 'chart' : 'attachment'); await reload();});}}/></label></div>
        {attachments.length ? <ul className="divide-y divide-slate-100">{attachments.map(item => <li key={item.id} className="flex items-center gap-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{item.name}</span><QuantButton disabled={busy} onClick={() => void run(async () => downloadQuantBlob(await downloadResource(item.assetId), item.name))}>下载</QuantButton><button className="text-slate-500 hover:text-red-600" disabled={busy} onClick={() => void run(async () => {await mt4Api.removeAttachment(collection, expertId, testId, item.id); await reload();})}>移除</button></li>)}</ul> : <p className="text-sm text-slate-500">暂无附件。</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>;
}
