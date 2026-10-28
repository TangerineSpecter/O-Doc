import {useState} from 'react';
import type {MT4Attachment} from '../../types/api/mt4Archive';
import {QuantButton, QuantModal, inputClass} from '../Quant/ui';

export function AttachmentNoteDialog({attachment, save, close}: {
    attachment: MT4Attachment;
    save: (note: string) => Promise<void>;
    close: () => void;
}) {
    const [note, setNote] = useState(attachment.note || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            await save(note);
            close();
        } catch (e) {
            setError(e instanceof Error ? e.message : '保存失败，请重试');
        } finally {
            setBusy(false);
        }
    };
    return <QuantModal title="附件备注" close={close} busy={busy} footer={<>
        <QuantButton onClick={close} disabled={busy}>取消</QuantButton>
        <QuantButton primary onClick={() => void submit()} disabled={busy}>{busy ? '保存中…' : '保存'}</QuantButton>
    </>}>
        <p className="break-all text-sm text-slate-600">{attachment.name}</p>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">
            <span>备注</span>
            <textarea className={`${inputClass} resize-none font-normal scrollbar-hide`} rows={4} maxLength={500}
                value={note} onChange={event => setNote(event.target.value)} placeholder="例如：EA 源码、默认参数或测试资料" />
        </label>
        <p className="text-xs text-slate-400">{note.length} / 500，留空可清除备注</p>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    </QuantModal>;
}
