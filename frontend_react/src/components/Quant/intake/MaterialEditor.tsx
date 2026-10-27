import type {QuantMaterial} from '../../../types/api/quantIntake';
import {Select} from '../../common/Select';
import {CodeEditor} from '../CodeEditor';
import {QuantButton, QuantField} from '../ui';
import {detectQuantLanguage} from '../../../utils/quantLanguage';
import {TongdaxinParameterHelp} from '../TongdaxinParameterHelp';

export function MaterialEditor({material, ordinal, change, remove}: {material: QuantMaterial; ordinal: number; change: (value: QuantMaterial) => void; remove: () => void}) {
    const patch = (value: Partial<QuantMaterial>) => change({...material, ...value});
    return <details className="rounded-xl border border-slate-200 bg-white p-4" open={ordinal === 1}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">{ordinal}. {material.title || '未命名资料'} <span className="font-normal text-slate-500">· {material.code.length + material.description.length} 字符</span></summary>
        <div className="mt-4 space-y-4">
            <QuantField label={`资料 ${ordinal} 标题（可留空）`} value={material.title} onChange={title => patch({title})} />
            <label className="block space-y-2 text-sm font-semibold"><span>资料 {ordinal} 语言</span><Select menuPortal value={material.language} onChange={language => patch({language})} options={[
                {value: 'auto', label: '自动识别'}, {value: 'pine', label: 'Pine Script'}, {value: 'python', label: 'Python'},
                {value: 'mql4', label: 'MQL4 / MQ4'}, {value: 'tongdaxin', label: '通达信'}, {value: 'text', label: '纯文本'},
            ]} /></label>
            <div><p className="mb-2 text-sm font-semibold">资料 {ordinal} 源码</p><CodeEditor value={material.code} onChange={code => patch({code})} language={material.language === 'auto' ? detectQuantLanguage(material.code) : material.language} /></div>
            <QuantField label={`资料 ${ordinal} 说明`} value={material.description} onChange={description => patch({description})} multiline rows={3} />
            {(material.language === 'tongdaxin' || material.language === 'auto' && detectQuantLanguage(material.code) === 'tongdaxin') && <TongdaxinParameterHelp fieldLabel={`资料 ${ordinal} 说明`}/>}
            <QuantField label={`资料 ${ordinal} 来源网址`} value={material.url} onChange={url => patch({url})} />
            <QuantButton danger onClick={remove}>移除此份资料</QuantButton>
        </div>
    </details>;
}
