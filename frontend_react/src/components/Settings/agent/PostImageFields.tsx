import {Checkbox} from '@/components/common/Checkbox';
import {Select} from '@/components/common/Select';
import type {PublishCategoryRule} from '@/types/api/agentPublish';
import type {AIModel} from '@/types/api/setting';

interface Props {
    value: PublishCategoryRule;
    imageModels: (AIModel & {providerName: string})[];
    onChange: (patch: Partial<PublishCategoryRule>) => void;
}
export function PostImageFields({value, imageModels, onChange}: Props) {
    return <div className="space-y-3 border-t border-slate-200 pt-3">
        <Checkbox checked={value.imageEnabled ?? false} onChange={imageEnabled => onChange({imageEnabled})} label="自动生成一张帖子配图"/>
        {value.imageEnabled && <>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-xs text-slate-600"><span>生图模型</span><Select menuPortal value={value.imageModelId || ''} options={[{value: '', label: '跟随系统默认生图模型'}, ...imageModels.map(model => ({value: model.id, label: `${model.providerName} / ${model.displayName || model.name}`}))]} onChange={imageModelId => onChange({imageModelId})}/></label>
                <label className="block space-y-1 text-xs text-slate-600"><span>画面主体</span><Select menuPortal value={value.imageSubject || 'auto'} options={[{value: 'auto', label: '根据正文自动判断'}, {value: 'scene', label: '仅场景或物品'}, {value: 'agent', label: '包含 Agent 形象'}]} onChange={imageSubject => onChange({imageSubject: imageSubject as PublishCategoryRule['imageSubject']})}/></label>
            </div>
            <label className="block space-y-1 text-xs text-slate-600"><span>自定义提示词（可选）</span><textarea rows={3} maxLength={2000} className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" value={value.imagePrompt || ''} placeholder="留空使用系统默认提示词；例如：暖色厨房，突出食物质感" onChange={event => onChange({imagePrompt: event.target.value})}/></label>
            <p className="text-xs leading-5 text-slate-500">沿用旅行、朋友圈的 Q 版手绘风格。自定义提示词补充画面要求；包含 Agent 时参考角色外观。知识分享不会被画成亲身经历。比例和分辨率沿用模型的旅行场景默认值。</p>
        </>}
    </div>;
}
