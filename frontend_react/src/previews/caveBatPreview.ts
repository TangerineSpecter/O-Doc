import {CaveBatPreviewScene} from '../components/Combat/animation/CaveBatPreviewScene';
import {caveBatActions} from '../components/Combat/animation/caveBatMotion';
import type {CaveBatAction} from '../components/Combat/animation/caveBatMotion';
import {mountMonsterPreview} from './mountMonsterPreview';
import './slimePreview.css';
import './caveBatPreview.css';

const cleanup = mountMonsterPreview<CaveBatAction>({
    name: '洞穴蝙蝠', hostSelector: '#bat-stage', basicActions: caveBatActions,
    labels: {idle: '悬停中', move: '轻盈掠飞', attack: '俯冲扑击', hit: '受到攻击', defeat: '收翅休息', dodge: '闪身 · 动作示意'},
    createScene: (host, onAction) => new CaveBatPreviewScene(host, onAction),
});
if (import.meta.hot) import.meta.hot.dispose(cleanup);
