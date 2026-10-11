import {useEffect, useState} from 'react';
import type {NovelController} from '../../hooks/useNovel';
import {useNovelPreparation} from '../../hooks/useNovelPreparation';
import {novelApi} from '../../api/novel';
import {Select} from '../common/Select';
import {Button, Field, Modal} from './ui';

const setupFields = [['genre', '题材与类型'], ['audience', '目标读者'], ['length', '篇幅目标'], ['pov', '叙事视角'], ['pace', '节奏'], ['characterCount', '核心人物数与配角规模'], ['chapterCast', '单章出场人数'], ['worldRules', '世界规则'], ['ending', '结局方向'], ['publicSynopsis', '公开简介（不给读者泄露秘密）']];
export function Preparation({c}: {c: NovelController}) {
    const n = c.novel!;
    const {form, change, changeSetup, save} = useNovelPreparation(c);
    const [models, setModels] = useState<{id: string; name: string; displayName: string}[]>([]);
    const [confirm, setConfirm] = useState(false);
    useEffect(() => {void novelApi.models().then(setModels).catch(() => {});}, []);
    const modelOptions = [{value: '', label: '跟随系统配置'}, ...models.map(m => ({value: m.id, label: m.displayName || m.name}))];
    return <div className="mx-auto max-w-4xl space-y-6 p-5 md:p-8"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-semibold tracking-wider text-orange-600">创作蓝图</p><h2 className="mt-2 text-xl font-semibold text-slate-800">先把这本书想清楚</h2><p className="mt-2 text-sm leading-6 text-slate-500">方向可以分次讨论。AI 的建议先作为候选；采用后，才进入正式设定。</p><div className="mt-6 grid gap-5 md:grid-cols-2"><Field label="小说名称（最多100字，可在讨论中更换）" value={form.title} onChange={title => change('title', title.slice(0, 100))}/><Field label="创作方向" value={form.direction} onChange={direction => change('direction', direction)}/>{setupFields.map(([key, label]) => <Field key={key} label={label} value={form.setup[key] || ''} onChange={value => changeSetup(key, value)}/>)}</div><div className="mt-6 space-y-5"><Field label="核心冲突、故事阶段、结局与伏笔" multiline value={form.blueprint} onChange={blueprint => change('blueprint', blueprint)}/><Field label="本书文风参考（可以采用右侧试写样本）" multiline value={form.style} onChange={style => change('style', style)}/><div className="grid gap-5 md:grid-cols-2"><label className="space-y-2 text-xs text-slate-500">主写模型<Select value={n.writerModelId} options={modelOptions} onChange={writerModelId => void c.patch({writerModelId})}/></label><label className="space-y-2 text-xs text-slate-500">编辑与整理模型<Select value={n.editorModelId} options={modelOptions} onChange={editorModelId => void c.patch({editorModelId})}/></label></div><div className="flex flex-wrap gap-2"><Button primary disabled={c.busy} onClick={() => setConfirm(true)}>保存并确认蓝图</Button><Button disabled={c.busy} onClick={() => void c.generate('style')}>生成文风试写</Button><Button disabled={c.busy} onClick={() => void c.generate('blueprint')}>提出完整蓝图</Button></div></div></div>{confirm && <Modal error={c.error} title="确认本书设定" close={() => setConfirm(false)}><p className="text-sm text-slate-600">{n.chapters.filter(x => x.adoptedId).length ? '设定变更会把已采用章节标为待复核。正文和已发布版本保留，后续创作需先确认故事状态。' : '保存后可继续修改，也可以先在右侧与 AI 讨论。'}</p><p className="text-sm text-slate-500">关联人物 {n.entities.length} · 线索 {n.threads.length} · 已采用章节 {n.chapters.filter(x => x.adoptedId).length}</p><Button primary disabled={c.busy} onClick={() => {void save().then(ok => {if (ok) setConfirm(false);});}}>确认保存</Button></Modal>}</div>;
}
