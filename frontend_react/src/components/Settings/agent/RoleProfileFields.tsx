import {Select} from '@/components/common/Select';
import type {RoleProfile} from '@/types/api/agentPrompt';
import {emptyRoleProfile, roleFields} from '@/utils/agentRole';

const fieldClass = 'w-full resize-none scrollbar-hide rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20';
export function RoleProfileFields({value, onChange}: {value: Partial<RoleProfile>; onChange: (profile: RoleProfile) => void}) {
    const update = (key: keyof RoleProfile, text: string) => onChange({...emptyRoleProfile, ...value, [key]: text});
    return <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold text-slate-700">年龄说明<input className={fieldClass} maxLength={100} value={value.age || ''} onChange={event => update('age', event.target.value)} placeholder="如：18岁 / 原作未明确"/></label>
            <label className="space-y-1.5 text-sm font-semibold text-slate-700">MBTI（可选）<Select menuPortal value={value.mbti || ''} options={[{value: '', label: '不设定'}, ...['ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP','ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ'].map(type => ({value: type, label: type}))]} onChange={text => update('mbti', text)}/></label>
        </div>
        {roleFields.map(([key, label, hint]) => {
            const field = <label className="block space-y-1.5 text-sm font-semibold text-slate-700">{label}<textarea aria-label={label} rows={3} maxLength={6000} className={fieldClass} value={value[key] || ''} onChange={event => update(key, event.target.value)} placeholder={hint}/></label>;
            return key === 'appearance' ? <details key={key} className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-600">外貌与服饰（按需填写）</summary><div className="mt-3">{field}</div></details> : <div key={key}>{field}</div>;
        })}
    </div>;
}
