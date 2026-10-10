import {MossBeastPreviewScene} from '../components/Combat/animation/MossBeastPreviewScene';
import {mossBeastActions} from '../components/Combat/animation/mossBeastMotion';
import type {MossBeastAction} from '../components/Combat/animation/mossBeastMotion';
import {mountMonsterPreview} from './mountMonsterPreview';
import './slimePreview.css';
import './skillPreview.css';
import './mossBeastPreview.css';

const cleanup = mountMonsterPreview<MossBeastAction>({
    name: '苔石兽', hostSelector: '#moss-beast-stage', basicActions: mossBeastActions,
    labels: {idle: '警戒中', move: '重步行进', attack: '蓄力冲撞', hit: '硬甲震颤', defeat: '伏地休息', guard: '护体 · 效果示意'},
    createScene: (host, onAction) => new MossBeastPreviewScene(host, onAction),
});
if (import.meta.hot) import.meta.hot.dispose(cleanup);
