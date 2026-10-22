import { useCallback, useState } from 'react';
import { quantApi } from '../../api/quant';
import { Select } from '../common/Select';
import { QuantButton, QuantField, QuantModal } from './ui';
import { quantKindOptions as kindOptions } from '../../utils/quant';
import { useQuantDraftRegistration, type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantKind } from '../../types/api/quant';

export function NewEntryModal({
    collection,
    controller,
    register,
    close,
    created,
}: {
    collection: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    close: () => void;
    created: (id: string) => void;
}) {
    const [title, setTitle] = useState('');
    const [kind, setKind] = useState<QuantKind>('factor');
    const save = useCallback(async () => {
        if (!title.trim()) {
            controller.setError('请先给研究起个名字');
            return false;
        }
        let id = '';
        const ok = await controller.safe(async () => {
            const result = await quantApi.create(collection, {
                title: title.trim(),
                kind,
                content: '',
                sourceUrl: '',
                tags: [],
            });
            id = result.id;
        });
        if (ok) {
            register('new-entry', null);
            created(id);
        }
        return ok;
    }, [title, kind, controller, collection, created, register]);
    useQuantDraftRegistration('new-entry', !!title.trim() || kind !== 'factor', save, register, () => {
        setTitle('');
        setKind('factor');
    });
    return (
        <QuantModal title="新建研究" close={close} busy={controller.busy}>
            <QuantField label="研究标题" value={title} onChange={setTitle} placeholder="例如：均线斜率因子" required />
            <label className="block space-y-2 text-sm font-semibold text-slate-700">
                <span className="block">条目类型</span>
                <Select menuPortal value={kind} options={kindOptions} onChange={setKind} />
            </label>
            <p className="text-xs leading-6 text-slate-500">
                填写标题即可保存。逻辑说明、不同语言代码、回测和附件可以逐步补充。
            </p>
            <div className="flex justify-end gap-3">
                <QuantButton disabled={controller.busy} onClick={close}>
                    取消
                </QuantButton>
                <QuantButton primary disabled={controller.busy || !title.trim()} onClick={() => void save()}>
                    创建研究
                </QuantButton>
            </div>
            {controller.error && (
                <p role="alert" className="text-sm text-red-600">
                    {controller.error}
                </p>
            )}
        </QuantModal>
    );
}
