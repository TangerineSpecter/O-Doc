import {MossKingPreviewScene} from '../components/Combat/animation/MossKingPreviewScene';
import {mossKingActions} from '../components/Combat/animation/mossKingMotion';
import type {MossKingAction} from '../components/Combat/animation/mossKingMotion';
import {mountMonsterPreview} from './mountMonsterPreview';
import './slimePreview.css';
import './skillPreview.css';
import './mossKingPreview.css';

const cleanup = mountMonsterPreview<MossKingAction>({
    name: '苔冠巨兽', hostSelector: '#moss-king-stage', basicActions: mossKingActions,
    labels: {idle: '警戒中', move: '沉稳巡行', attack: '抬蹄踏击', hit: '岩甲回震', defeat: '屈膝伏地', strike: '重击 · 效果示意', guard: '护体 · 效果示意'},
    createScene: (host, onAction) => new MossKingPreviewScene(host, onAction),
});
if (import.meta.hot) import.meta.hot.dispose(cleanup);
