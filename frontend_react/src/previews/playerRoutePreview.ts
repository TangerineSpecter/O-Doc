import './slimePreview.css';
import './playerRoutePreview.css';
import {PlayerRoutePreviewScene} from '../components/Combat/animation/PlayerRoutePreviewScene';
import {playerActions} from '../components/Combat/animation/playerRouteMotion';
import type {PlayerAction} from '../components/Combat/animation/playerRouteMotion';
import {playerJobDetails, playerJobs} from '../components/Combat/animation/playerRouteArt';
import type {PreviewWeapon} from '../components/Combat/animation/playerRouteArt';
import {playerDemoSkills, playerSkillNames} from '../components/Combat/animation/playerRouteEffects';
import type {PlayerDemoSkill} from '../components/Combat/animation/playerRouteEffects';
import {mountMonsterPreview} from './mountMonsterPreview';

const actions: Record<PlayerAction, string> = {idle: '待机中', move: '移动中', cast: '施法中', hit: '受击中', defeat: '已倒下'};
let scene: PlayerRoutePreviewScene;
const cleanup = mountMonsterPreview({name: '像素角色', hostSelector: '#slime-stage', basicActions: playerActions,
    labels: actions, createScene: (host, onComplete) => {
        scene = new PlayerRoutePreviewScene(host, onComplete); return scene;
    }});
const subscription = new AbortController();
const options = {signal: subscription.signal};
const skillLabel = document.querySelector<HTMLElement>('#equipped-skill')!;

// Controls sit below the stage on phones; show the result before playback advances.
document.querySelectorAll<HTMLButtonElement>('[data-action], [data-skill]').forEach(button => {
    button.addEventListener('click', () => {
        if (innerWidth > 840) return;
        const host = document.querySelector<HTMLElement>('#slime-stage')!;
        const rect = host.getBoundingClientRect();
        const visibleHeight = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
        if (visibleHeight < rect.height * .5) host.scrollIntoView({block: 'center', behavior: 'auto'});
    }, options);
});

function bindChoice<T extends string>(key: string, choices: readonly T[], apply: (value: T) => void) {
    const buttons = document.querySelectorAll<HTMLButtonElement>(`[data-${key}]`);
    buttons.forEach(button => button.addEventListener('click', () => {
        const value = button.dataset[key];
        if (!choices.includes(value as T)) return;
        apply(value as T);
        buttons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    }, options));
}

bindChoice('job', playerJobs, job => {
    scene.setJob(job);
    const details = playerJobDetails[job];
    document.querySelector<HTMLElement>('#job-name')!.textContent = details.name;
    document.querySelector<HTMLElement>('#job-level')!.textContent = details.level;
    document.querySelector<HTMLElement>('#appearance-name')!.textContent = `${details.name} · 像素形象`;
});
bindChoice<PreviewWeapon>('weapon', ['none', 'demo.crystal_staff'], weapon => {
    scene.setWeapon(weapon);
    document.querySelector<HTMLElement>('#weapon-name')!.textContent = weapon === 'none' ? '空手' : '临时水晶法杖';
});
bindChoice<PlayerDemoSkill>('skill', playerDemoSkills, skill => {
    scene.setSkill(skill);
    skillLabel.textContent = playerSkillNames[skill];
    document.querySelector<HTMLButtonElement>('[data-action="cast"]')!.click();
    document.querySelector<HTMLElement>('#scene-state')!.textContent = scene.isPaused ? '已暂停' : `${playerSkillNames[skill]} · 演示`;
});
function release() { subscription.abort(); cleanup(); }
window.addEventListener('pagehide', () => subscription.abort(), {once: true, ...options});
if (import.meta.hot) import.meta.hot.dispose(release);
