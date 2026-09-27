import {useState} from 'react';
import {Loader2, Sparkles, Undo2} from 'lucide-react';
import Checkbox from '@/components/common/Checkbox';
import {isImageAvatarValue} from '@/utils/avatar';
import type {CharacterType} from '@/types/api/agentPrompt';
import {useAgentPromptGeneration} from './useAgentPromptGeneration';
import {PromptEditorModal} from './PromptEditorModal';

interface Props {
    name: string;
    avatar: string;
    modelId: string;
    prompt: string;
    avatarUploading: boolean;
    onApply: (prompt: string) => void;
}

const fieldClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500';

export function AgentPromptGenerator({name, avatar, modelId, prompt, avatarUploading, onApply}: Props) {
    const [open, setOpen] = useState(false);
    const [characterType, setCharacterType] = useState<CharacterType>('existing');
    const [characterName, setCharacterName] = useState(name);
    const [source, setSource] = useState('');
    const [description, setDescription] = useState('');
    const [requirements, setRequirements] = useState('');
    const [referenceAvatar, setReferenceAvatar] = useState(true);
    const [researchCharacter, setResearchCharacter] = useState(false);
    const [undo, setUndo] = useState<{before: string; applied: string} | null>(null);
    const imageAvatar = isImageAvatarValue(avatar);
    const generation = useAgentPromptGeneration({
        characterType, characterName, source, description, requirements, avatar, modelId,
        referenceAvatar: referenceAvatar && imageAvatar,
        researchCharacter: characterType === 'existing' && researchCharacter,
    }, open);
    const busy = generation.phase !== 'idle';
    const valid = characterName.trim() && (characterType === 'existing' ? source.trim() : description.trim());
    const canUndo = undo && prompt === undo.applied;

    return <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="agent-prompt" className="text-sm font-semibold text-slate-700">提示词</label>
            <div className="flex flex-wrap items-center gap-2">
                <PromptEditorModal name={name} value={prompt} onChange={onApply}/>
                <button type="button" onClick={() => {
                    if (!open && !characterName.trim()) setCharacterName(name);
                    setOpen(!open);
                }} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100">
                    <Sparkles className="h-3.5 w-3.5"/>{open ? '收起生成面板' : '生成角色提示词'}
                </button>
            </div>
        </div>
        {open && <section className="space-y-4 rounded-xl border border-orange-100 bg-orange-50/40 p-4" aria-label="角色提示词生成">
            <p className="text-xs leading-5 text-slate-500">填写角色信息，生成包含性格、人格倾向和相处方式的角色卡。预览后再应用。</p>
            <div className="flex gap-2" role="group" aria-label="角色类型">
                {([['existing', '已有作品角色'], ['original', '原创角色']] as const).map(([value, label]) =>
                    <button key={value} type="button" aria-pressed={characterType === value} onClick={() => setCharacterType(value)} className={`rounded-lg px-3 py-2 text-xs font-medium ${characterType === value ? 'bg-orange-500 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}
            </div>
            <label className="block space-y-1.5 text-xs font-medium text-slate-600">角色姓名
                <input className={fieldClass} value={characterName} maxLength={100} onChange={event => setCharacterName(event.target.value)} placeholder="如：菲伦 / Fern"/>
            </label>
            {characterType === 'existing' ? <label className="block space-y-1.5 text-xs font-medium text-slate-600">角色出处
                <input className={fieldClass} value={source} maxLength={200} onChange={event => setSource(event.target.value)} placeholder="如：葬送的芙莉莲"/>
            </label> : <label className="block space-y-1.5 text-xs font-medium text-slate-600">原创角色设定
                <textarea className={fieldClass} rows={3} value={description} maxLength={4000} onChange={event => setDescription(event.target.value)} placeholder="介绍身份、性格和你想要的相处方式"/>
            </label>}
            <label className="block space-y-1.5 text-xs font-medium text-slate-600">补充要求（可选）
                <textarea className={fieldClass} rows={2} value={requirements} maxLength={4000} onChange={event => setRequirements(event.target.value)} placeholder="如：ISTJ 倾向，慢热但关心人；也可补充剧情阶段或角色资料"/>
            </label>
            <Checkbox
                checked={referenceAvatar && imageAvatar}
                disabled={!imageAvatar || avatarUploading}
                onChange={setReferenceAvatar}
                label={<>参考当前头像{!imageAvatar && <span className="text-slate-400">（上传图片后可用）</span>}</>}
                labelClassName="text-xs text-slate-600"
                className="gap-2"
                size="md"
            />
            <Checkbox
                checked={researchCharacter && characterType === 'existing'}
                disabled={characterType !== 'existing' || busy}
                onChange={setResearchCharacter}
                label={<>联网检索角色资料<span className="text-slate-400">（Tavily）</span></>}
                labelClassName="text-xs text-slate-600"
                className="gap-2"
                size="md"
            />
            <p className="text-[11px] text-slate-400">{modelId ? '使用当前选择的对话模型' : '使用系统默认对话模型'}；头像仅用于辅助描述外观。勾选联网检索后，会先查找已配置的 Tavily MCP；未配置时仍会继续生成。</p>
            <button type="button" disabled={!valid || busy || avatarUploading} onClick={() => void generation.generate()} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin"/>}
                {generation.phase === 'avatar' ? '正在识别头像…' : generation.phase === 'research' ? '正在检索角色资料…' : generation.phase === 'generation' ? '正在生成角色设定…' : generation.hasPreview ? '重新生成' : '开始生成'}
            </button>
            <div aria-live="polite" className="space-y-2 text-xs leading-5">
                {generation.warning && <p className="text-amber-700">{generation.warning}</p>}
                {generation.error && <p role="alert" className="text-red-600">{generation.error}</p>}
                {generation.question && <p className="rounded-lg bg-white p-3 text-slate-700">{generation.question} 请在补充要求中完善资料后重新生成。</p>}
            </div>
            {generation.hasPreview && <div className="space-y-2">
                <label htmlFor="agent-prompt-preview" className="text-xs font-semibold text-slate-700">生成预览（可修改）</label>
                <textarea id="agent-prompt-preview" className={`${fieldClass} leading-6`} rows={14} value={generation.preview} onChange={event => generation.setPreview(event.target.value)}/>
                <div className="flex flex-wrap items-center gap-3">
                    <button type="button" disabled={!generation.preview.trim()} onClick={() => {
                        setUndo(current => ({before: current && prompt === current.applied ? current.before : prompt, applied: generation.preview}));
                        onApply(generation.preview);
                    }} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">应用到提示词</button>
                    <span className="text-xs text-slate-500">应用后仍需保存 Agent</span>
                </div>
            </div>}
        </section>}
        {canUndo && <div className="flex items-center justify-between gap-2 rounded-lg bg-lime-50 px-3 py-2 text-xs text-lime-700">
            <span>已应用生成的提示词</span>
            <button type="button" className="inline-flex items-center gap-1" onClick={() => {onApply(undo.before); setUndo(null);}}><Undo2 className="h-3 w-3"/>撤销应用</button>
        </div>}
    </div>;
}
