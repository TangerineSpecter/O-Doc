import { createPortal } from 'react-dom';
import { QuantButton, QuantModal } from './ui';
import type { useQuantNavigation } from '../../hooks/useQuantNavigation';

export function UnsavedDialog({ guard, error }: { guard: ReturnType<typeof useQuantNavigation>; error: string }) {
    if (!guard.pending) return null;
    // Confirmation must sit above both inline dialogs and body portals.
    return createPortal(
        <QuantModal title="还有未保存的修改" close={guard.cancel} busy={guard.saving} layer="confirmation">
            <p className="text-sm leading-7 text-slate-600">{guard.canSave ? '保存后再离开，可以保留刚写下的研究说明、代码或实验资料。' : '实验尚未启动。返回继续设置，或放弃本次配置后离开；离开不会自动启动实验。'}</p>
            {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                    {error}
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <QuantButton disabled={guard.saving} onClick={guard.cancel}>
                    继续编辑
                </QuantButton>
                <QuantButton danger disabled={guard.saving} onClick={guard.discard}>
                    放弃修改
                </QuantButton>
                {guard.canSave && <QuantButton primary disabled={guard.saving} onClick={() => void guard.saveAndContinue()}>
                    {guard.saving ? '保存中…' : '保存并继续'}
                </QuantButton>}
            </div>
        </QuantModal>, document.body,
    );
}
