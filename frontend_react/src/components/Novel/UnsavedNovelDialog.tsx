import type {useNovelNavigation} from '../../hooks/useNovelNavigation';
import {Button, Modal} from './ui';

export function UnsavedNovelDialog({guard, busy, error}: {guard: ReturnType<typeof useNovelNavigation>; busy: boolean; error: string}) {
    if (!guard.pending) return null;
    return <Modal error={error} title="当前正文尚未保存" close={guard.cancel}>
        <p className="text-sm text-slate-500">继续前，可以保存当前修改，或放弃本次未保存的正文。</p>
        <Button primary disabled={busy || guard.saving} onClick={() => void guard.saveAndContinue()}>保存并继续</Button>
        <Button disabled={busy || guard.saving} onClick={guard.discard}>放弃本次未保存修改</Button>
        <Button disabled={guard.saving} onClick={guard.cancel}>继续编辑</Button>
    </Modal>;
}
