import { useCallback, useState } from 'react';
import { quantApi } from '../../api/quant';
import { createRequestKey } from '../../utils/requestKey';
import { detectQuantLanguage } from '../../utils/quantLanguage';
import { Select } from '../common/Select';
import { QuantButton, QuantField, QuantModal } from './ui';
import { CodeEditor } from './CodeEditor';
import {TongdaxinParameterHelp} from './TongdaxinParameterHelp';
import { useQuantDraftRegistration, type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantIntakeInput } from '../../types/api/quant';

export function NewEntryModal({ collection, controller, register, close, created }: {
    collection: string; controller: QuantController; register: QuantRegisterDraft;
    close: () => void; created: (id: string) => void;
}) {
    const [archived, setArchived] = useState<{ id: string; notice: string } | null>(null);
    const [draft, setDraft] = useState<QuantIntakeInput>(() => ({ requestKey: createRequestKey(), title: '',
        code: '', description: '', url: '', language: 'auto', platform: '', analyze: true,
        modelId: controller.models.defaultModelId || controller.models.models[0]?.id || '' }));
    const patch = <K extends keyof QuantIntakeInput>(key: K, value: QuantIntakeInput[K]) =>
        setDraft(current => ({ ...current, [key]: value }));
    const dirty = !archived && !!(draft.code || draft.description || draft.url || draft.title);
    const save = useCallback(async () => {
        let id = '';
        let notice = '';
        const ok = await controller.safe(async () => {
            const result = await quantApi.collect(collection, draft);
            id = result.entry.id;
            notice = result.notice;
        });
        if (ok) {
            register('new-entry', null);
            if (notice) setArchived({ id, notice });
            else created(id);
        }
        return ok;
    }, [collection, controller, created, draft, register]);
    useQuantDraftRegistration('new-entry', dirty, save, register, () =>
        setDraft(current => ({ ...current, code: '', description: '', url: '', title: '' })));
    if (archived) return <QuantModal title="资料已保存" close={() => created(archived.id)}>
        <p role="status" className="text-sm leading-7 text-slate-600">自动分析未启动：{archived.notice}。资料已完整归档，可在报告页重新分析。</p>
        <QuantButton primary onClick={() => created(archived.id)}>查看已收集资料</QuantButton>
    </QuantModal>;
    return <QuantModal title="收集并分析" close={close} wide busy={controller.busy}>
        <p className="text-sm leading-6 text-slate-600">放入你发现的代码和说明，AI 将整理原理、参数、研究评价与验证计划。普通新分析最多7次模型调用；没有修订目标时跳过额外调用。</p>
        <div className="grid gap-4 sm:grid-cols-2">
            <QuantField label="标题（可留空，由 AI 命名）" value={draft.title} onChange={v => patch('title', v)} />
            <label className="space-y-2 text-sm font-semibold text-slate-700"><span className="block">代码语言</span>
                <Select menuPortal value={draft.language} onChange={v => patch('language', v)} options={[
                    { value: 'auto', label: '自动识别' }, { value: 'pine', label: 'Pine Script' },
                    { value: 'mql4', label: 'MQL4 / MQ4' }, { value: 'python', label: 'Python / 聚宽' },
                    { value: 'tongdaxin', label: '通达信公式' }, { value: 'text', label: '其他 / 纯文本' },
                ]} /></label>
        </div>
        <div className="space-y-2"><span className="text-sm font-semibold text-slate-700">源代码</span>
            <CodeEditor value={draft.code} onChange={v => patch('code', v)} language={draft.language === 'auto' ? detectQuantLanguage(draft.code) : draft.language} />
        </div>
        <QuantField label="作者说明、使用方法或你关注的问题" value={draft.description} onChange={v => patch('description', v)} multiline rows={4} />
        {(draft.language === 'tongdaxin' || draft.language === 'auto' && detectQuantLanguage(draft.code) === 'tongdaxin') && <TongdaxinParameterHelp fieldLabel="作者说明、使用方法或你关注的问题"/>}
        <QuantField label="来源网址" value={draft.url} onChange={v => patch('url', v)} placeholder="https://…" />
        <p className="text-xs leading-5 text-slate-500">分析时会尝试获取公开网页正文并保存快照。需要登录、验证或动态加载的内容，请同时粘贴代码与说明；系统不会执行网页或源码。</p>
        <label className="space-y-2 text-sm font-semibold text-slate-700"><span className="block">分析模型</span>
            <Select menuPortal value={draft.modelId} onChange={v => patch('modelId', v)} options={controller.models.models.map(m => ({ value: m.id, label: m.name }))} emptyMessage="尚未配置模型，资料将先归档" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.analyze} onChange={e => patch('analyze', e.target.checked)} />保存后自动分析</label>
        <div className="flex justify-end gap-3"><QuantButton onClick={close} disabled={controller.busy}>取消</QuantButton>
            <QuantButton primary onClick={() => void save()} disabled={controller.busy || !(draft.code.trim() || draft.description.trim() || draft.url.trim())}>
                {controller.busy ? '正在保存…' : draft.analyze ? '收集并分析' : '仅收集'}
            </QuantButton></div>
        {controller.error && <p role="alert" className="text-sm text-red-600">{controller.error}</p>}
    </QuantModal>;
}
