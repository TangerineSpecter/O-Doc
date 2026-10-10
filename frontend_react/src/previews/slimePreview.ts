import {SlimePreviewScene} from '../components/Combat/animation/SlimePreviewScene';
import {slimeActions} from '../components/Combat/animation/slimeMotion';
import {mountMonsterPreview} from './mountMonsterPreview';
import './slimePreview.css';

const cleanup = mountMonsterPreview({
    name: '软泥怪', hostSelector: '#slime-stage', basicActions: slimeActions,
    labels: {idle: '待机中', move: '弹跳移动', attack: '蓄力跃击', hit: '受到攻击', defeat: '需要休息一下'},
    createScene: (host, onAction) => new SlimePreviewScene(host, onAction),
});
if (import.meta.hot) import.meta.hot.dispose(cleanup);
