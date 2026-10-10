import {Application, Assets, Container, Graphics} from 'pixi.js';
import type {Texture} from 'pixi.js';
import mossCaveImage from '../../../assets/combat/moss-cave.svg';
import {PlayerRouteActor} from './PlayerRouteActor';
import {playerSheetUrl} from './playerRouteArt';
import type {PlayerJob, PreviewWeapon} from './playerRouteArt';
import {playerActionDurations, samplePlayerPose} from './playerRouteMotion';
import type {PlayerAction} from './playerRouteMotion';
import {drawPlayerMagicBolt, playerSkillTimings, sampleSkillHitTime, samplePlayerSkillFeedback} from './playerRouteEffects';
import type {PlayerDemoSkill} from './playerRouteEffects';
import {PlayerSkillRenderer} from './PlayerSkillRenderer';
import {SlimeActor} from './SlimeActor';
import {sampleSlimePose} from './slimeMotion';
import {createSlimeStage} from './slimeStage';
import type {SlimeBackdrop} from './slimeStage';

export class PlayerRoutePreviewScene {
    private readonly app = new Application();
    private readonly world = new Container();
    private stage = createSlimeStage('cave');
    private readonly slime = new SlimeActor();
    private readonly heroShadow = new Graphics().ellipse(0, 6, 52, 12).fill({color: 0x356663, alpha: .16});
    private readonly slimeShadow = new Graphics().ellipse(0, 8, 80, 13).fill({color: 0x356663, alpha: .16});
    private readonly effect = new Graphics();
    private readonly skillRenderer = new PlayerSkillRenderer();
    private readonly shade = new Graphics().rect(-330, -300, 660, 420).fill(0x293745);
    private readonly observer: ResizeObserver;
    private readonly visibilityObserver: IntersectionObserver;
    private actor?: PlayerRouteActor;
    private cave?: Texture;
    private initialized = false;
    private disposed = false;
    private visible = true;
    private action: PlayerAction = 'idle';
    private skill: PlayerDemoSkill = 'skill.player.004';
    private job: PlayerJob = 'job.novice';
    private facing: -1 | 1 = 1;
    private time = 0;
    private ambientTime = 0;
    private small = false;
    private paused = matchMedia('(prefers-reduced-motion: reduce)').matches;

    constructor(private readonly host: HTMLElement, private readonly onComplete: (action: PlayerAction) => void) {
        this.observer = new ResizeObserver(this.resize);
        this.visibilityObserver = new IntersectionObserver(entries => {
            this.visible = entries.some(entry => entry.isIntersecting);
            this.syncPlayback();
        });
    }

    async init() {
        await this.app.init({width: this.host.clientWidth, height: this.host.clientHeight,
            antialias: true, backgroundAlpha: 0, resolution: Math.min(devicePixelRatio || 1, 2),
            autoDensity: true, preference: 'webgl'});
        this.initialized = true;
        if (this.disposed) { this.app.destroy(true, {children: true}); return; }
        const [sheet, cave] = await Promise.all([
            Assets.load<Texture>(playerSheetUrl),
            Assets.load<Texture>({src: mossCaveImage, data: {resolution: 2}}),
        ]);
        if (this.disposed) return;
        sheet.source.scaleMode = 'nearest';
        this.cave = cave;
        this.actor = new PlayerRouteActor(sheet, this.job);
        this.stage.destroy({children: true});
        this.stage = createSlimeStage('cave', cave);
        this.shade.alpha = 0;
        this.world.addChild(this.stage, this.shade, this.heroShadow, this.slimeShadow,
            this.skillRenderer.ground, this.skillRenderer.rear, this.slime, this.actor,
            this.skillRenderer.front, this.effect);
        this.app.stage.addChild(this.world);
        this.host.appendChild(this.app.canvas);
        this.app.canvas.setAttribute('aria-label', '玩家像素角色与软泥怪的 PixiJS 动作预览');
        this.observer.observe(this.host);
        this.visibilityObserver.observe(this.host);
        document.addEventListener('visibilitychange', this.syncPlayback);
        this.resize();
        this.app.ticker.add(ticker => {
            const delta = Math.min(ticker.deltaMS / 1000, .05);
            this.time += delta;
            this.ambientTime += delta;
            const duration = this.action === 'cast' ? playerSkillTimings[this.skill].duration : playerActionDurations[this.action];
            if (this.action !== 'defeat' && this.time >= duration) {
                this.action = 'idle'; this.time = 0; this.onComplete('idle');
            }
            this.draw();
        });
        this.syncPlayback();
    }

    get isPaused() { return this.paused; }
    play(action: PlayerAction) { this.action = action; this.time = 0; this.render(); }
    setJob(job: PlayerJob) { this.job = job; this.actor?.setJob(job); this.render(); }
    setWeapon(weapon: PreviewWeapon) { this.actor?.setWeapon(weapon); this.render(); }
    setSkill(skill: PlayerDemoSkill) { this.skill = skill; }
    setFacing(facing: -1 | 1) { this.facing = facing; this.render(); }
    setSmall(small: boolean) { this.small = small; this.render(); }
    setBackdrop(backdrop: SlimeBackdrop) {
        this.stage.destroy({children: true});
        this.stage = createSlimeStage(backdrop, this.cave);
        this.world.addChildAt(this.stage, 0);
        this.render();
    }
    togglePaused() { this.paused = !this.paused; this.syncPlayback(); return this.paused; }

    private syncPlayback = () => {
        if (!this.initialized || this.disposed) return;
        if (this.paused || document.hidden || !this.visible) this.app.stop();
        else this.app.start();
    };

    private resize = () => {
        if (!this.initialized || this.disposed) return;
        const width = this.host.clientWidth, height = this.host.clientHeight;
        if (!width || !height) return;
        this.app.renderer.resize(width, height);
        this.world.position.set(width / 2, height * .78);
        this.world.scale.set(Math.min(width / 640, height / 420));
        this.render();
    };
    private render() { if (!this.actor || this.disposed) return; this.draw(); this.app.render(); }

    private draw() {
        if (!this.actor) return;
        const pose = samplePlayerPose(this.action, this.time, playerSkillTimings[this.skill].release);
        const scale = this.small ? .55 : 1.08;
        const sourceX = -128 * this.facing + pose.x * this.facing;
        const targetX = 128 * this.facing;
        this.actor.position.set(sourceX, 0);
        this.actor.scale.set(scale);
        this.actor.update(pose, this.facing);
        this.heroShadow.position.x = sourceX;
        this.heroShadow.scale.set(scale);
        this.slime.position.set(targetX, 0);
        this.slime.scale.set(this.small ? .4 : .74);
        const impactTime = this.action === 'cast' ? sampleSkillHitTime(this.skill, this.time) : undefined;
        const hit = impactTime !== undefined;
        this.slime.update(sampleSlimePose(hit ? 'hit' : 'idle', impactTime ?? this.ambientTime, -this.facing as -1 | 1), this.ambientTime, -this.facing as -1 | 1);
        this.slimeShadow.x = targetX;
        this.slimeShadow.scale.set(this.small ? .55 : 1);
        this.effect.scale.set(scale);
        if (this.action === 'cast') {
            const emitter = this.actor.getCastAnchor();
            const anchors = {
                sourceX: sourceX / scale, targetX: targetX / scale,
                emitterX: sourceX / scale + emitter.x, emitterY: emitter.y, facing: this.facing,
            };
            if (this.skill === 'skill.player.004') drawPlayerMagicBolt(this.effect, this.time, anchors);
            else this.effect.clear();
            this.skillRenderer.draw(this.skill, this.time, anchors, scale);
            const feedback = samplePlayerSkillFeedback(this.skill, this.time);
            this.shade.alpha = feedback.shade;
            this.world.pivot.set(feedback.shakeX, feedback.shakeY);
        } else {
            this.effect.clear(); this.skillRenderer.clear();
            this.shade.alpha = 0; this.world.pivot.set(0, 0);
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.observer.disconnect(); this.visibilityObserver.disconnect();
        document.removeEventListener('visibilitychange', this.syncPlayback);
        this.skillRenderer.dispose();
        if (this.initialized) this.app.destroy(true, {children: true});
        // Children not yet mounted are still owned here if initialization was interrupted.
        if (!this.world.destroyed) this.world.destroy({children: true});
        if (!this.slime.destroyed) this.slime.destroy();
        if (!this.stage.destroyed) this.stage.destroy({children: true});
        for (const object of [this.heroShadow, this.slimeShadow, this.effect, this.shade]) if (!object.destroyed) object.destroy();
    }
}
