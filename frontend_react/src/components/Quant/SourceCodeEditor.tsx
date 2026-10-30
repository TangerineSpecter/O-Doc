import { useCallback, useState } from 'react';
import { Save } from 'lucide-react';
import { quantApi } from '../../api/quant';
import { useQuantDraftRegistration, type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantEntryDetail, QuantLanguage, QuantSource } from '../../types/api/quant';
import { CodeEditor } from './CodeEditor';
import { QuantButton, cardClass } from './ui';

export function SourceCodeEditor({ source, entry, collection, controller, register, saved }: {
    source: QuantSource; entry: QuantEntryDetail; collection: string; controller: QuantController;
    register: QuantRegisterDraft; saved: (id: string) => void;
}) {
    const original = source.payload.code || '';
    const [code, setCode] = useState(original);
    const language = source.payload.language;
    const supported = language === 'python' || language === 'pine' || language === 'mql4';
    const editable = supported && source.payload.bundleVersion !== 1;
    const save = useCallback(async () => {
        if (!editable || !code.trim()) {
            controller.setError('代码不能为空，且须是支持的单文件语言');
            return false;
        }
        let id = '';
        const ok = await controller.safe(async () => {
            const result = await quantApi.implementation(collection, entry.id, {
                name: `${entry.title || '来源代码'} · ${language}`.slice(0, 255),
                language: language as QuantLanguage,
                languageVersion: source.payload.languageVersion || '',
                dependencies: source.payload.dependencies || '',
                parameters: source.payload.parameters || '',
                code,
                note: `基于来源快照 ${source.id} 编辑`,
            });
            id = result.id;
        });
        if (ok) saved(id);
        return ok;
    }, [code, collection, controller, editable, entry.id, entry.title, language, saved, source]);
    useQuantDraftRegistration('source-code-editor', editable && code !== original, save, register, () => setCode(original));
    return <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-semibold text-slate-900">已上传的来源代码</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">原始来源供已有研究引用；保存修改会创建独立的代码实现及来源快照。原来源的作者说明和网址不会自动带入新来源。</p></div>
            {editable && <QuantButton primary disabled={controller.busy || code === original || !code.trim()} onClick={() => void save()}><Save size={15}/>保存为新版本</QuantButton>}
        </div>
        {!editable && <p className="mb-3 text-xs text-slate-500">此来源为多文件资料或暂不支持保存为代码实现，可在此查看原文。</p>}
        <CodeEditor value={code} onChange={editable ? setCode : undefined} readOnly={!editable}
            language={supported ? language : language === 'tongdaxin' ? 'tongdaxin' : 'text'}/>
    </section>;
}
