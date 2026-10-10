import {SlimePreviewScene} from '../components/Combat/animation/SlimePreviewScene';
import {slimeActions} from '../components/Combat/animation/slimeMotion';
import type {SlimeAction} from '../components/Combat/animation/slimeMotion';
import './slimePreview.css';

const host = document.querySelector<HTMLElement>('#slime-stage')!;
const stateLabel = document.querySelector<HTMLElement>('#scene-state')!;
const loadMessage = document.querySelector<HTMLElement>('#load-message')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause')!;
const controls = document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input');
const stateLabels: Record<SlimeAction, string> = {
    idle: '待机中', move: '弹跳移动', attack: '蓄力跃击', hit: '受到攻击', defeat: '需要休息一下',
};
let currentAction: SlimeAction = 'idle';
let ready = false;

function selectAction(action: SlimeAction) {
    currentAction = action;
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.action === action));
    });
    updateStatus();
}

const scene = new SlimePreviewScene(host, selectAction);

function updateStatus() {
    stateLabel.textContent = scene.isPaused ? '已暂停' : stateLabels[currentAction];
    pauseButton.textContent = scene.isPaused ? '▷ 继续动画' : 'Ⅱ 暂停动画';
    pauseButton.setAttribute('aria-pressed', String(scene.isPaused));
}

function play(action: SlimeAction) {
    if (!ready) return;
    scene.play(action);
    selectAction(action);
}

controls.forEach(control => { control.disabled = true; });
scene.init().then(() => {
    ready = true;
    loadMessage.hidden = true;
    controls.forEach(control => { control.disabled = false; });
    updateStatus();
}).catch(() => {
    scene.dispose();
    loadMessage.textContent = '动画加载失败，请刷新页面重试。';
    loadMessage.setAttribute('role', 'alert');
    stateLabel.textContent = '暂不可用';
});

document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
    button.addEventListener('click', () => play(button.dataset.action as SlimeAction));
});

function bindSegments(attribute: 'facing' | 'backdrop', onChange: (value: string) => void) {
    const buttons = document.querySelectorAll<HTMLButtonElement>(`[data-${attribute}]`);
    buttons.forEach(button => button.addEventListener('click', () => {
        onChange(button.dataset[attribute]!);
        buttons.forEach(sibling => sibling.setAttribute('aria-pressed', String(sibling === button)));
    }));
}
bindSegments('facing', value => scene.setFacing(value === '-1' ? -1 : 1));
bindSegments('backdrop', value => {
    const cave = value === 'cave';
    scene.setBackdrop(cave ? 'cave' : 'plain');
    document.querySelector<HTMLElement>('.habitat')!.textContent = cave ? '苔石洞窟' : '素色舞台';
    document.querySelector<HTMLElement>('.habitat-en')!.textContent = cave ? 'MOSS CAVE' : 'PORTRAIT STAGE';
});
document.querySelector<HTMLInputElement>('#small-size')!.addEventListener('change', event => {
    scene.setSmall((event.target as HTMLInputElement).checked);
});
pauseButton.addEventListener('click', () => { scene.togglePaused(); updateStatus(); });

const onKeydown = (event: KeyboardEvent) => {
    if (!ready || event.altKey || event.metaKey || event.ctrlKey || event.repeat) return;
    if ((event.target as HTMLElement).closest('input, textarea, [contenteditable=true]')) return;
    const number = Number(event.key);
    if (number >= 1 && number <= 5) play(slimeActions[number - 1]);
    if (event.code === 'Space' && !(event.target as HTMLElement).closest('button')) {
        event.preventDefault(); scene.togglePaused(); updateStatus();
    }
};
document.addEventListener('keydown', onKeydown);

function cleanup() {
    ready = false;
    document.removeEventListener('keydown', onKeydown);
    scene.dispose();
}
// pagehide handles navigation; HMR also releases WebGL/ticker/observer resources.
window.addEventListener('pagehide', cleanup, {once: true});
if (import.meta.hot) import.meta.hot.dispose(cleanup);
