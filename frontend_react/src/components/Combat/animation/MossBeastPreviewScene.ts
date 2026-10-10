import {Application, Assets, Container, Graphics} from 'pixi.js';
import type {Texture} from 'pixi.js';
import mossCaveImage from '../../../assets/combat/moss-cave.svg';
import {MossBeastActor} from './MossBeastActor';
import {sampleMossBeastPose, mossBeastDurations} from './mossBeastMotion';
import type {MossBeastAction, MossBeastFacing, MossBeastPose} from './mossBeastMotion';
import {createSlimeStage} from './slimeStage';
import {drawMossBeastGuard} from './mossBeastGuardEffect';
import type {SlimeBackdrop} from './slimeStage';

/** Preview effects are demonstrations; combat truth and targets belong to future event playback. */
export class MossBeastPreviewScene {
    private readonly app = new Application();
    private readonly world = new Container();
    private readonly actor = new MossBeastActor();
    private readonly shadow = new Graphics().ellipse(0, 8, 144, 18).fill({color: 0x356663, alpha: .18});
    private readonly shield = new Graphics();
    private readonly shieldFront = new Graphics();
    private readonly dust = new Graphics();
    private readonly motes = new Graphics();
    private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    private visible = true;
    private readonly visibilityObserver = new IntersectionObserver(entries => {
        this.visible = entries.some(entry => entry.isIntersecting);
        this.syncPlayback();
    });
    private stage = createSlimeStage('cave');
    private caveTexture: Texture | undefined;
    private readonly observer: ResizeObserver;
    private initialized = false;
    private disposed = false;
    private action: MossBeastAction = 'idle';
    private facing: MossBeastFacing = 1;
    private time = 0;
    private ambientTime = 0;
    private actorScale = 1.06;
    private paused = this.reducedMotion.matches;

    constructor(private readonly host: HTMLElement, private readonly onComplete: (action: MossBeastAction) => void) {
        this.observer = new ResizeObserver(this.resize);
    }

    async init() {
        await this.app.init({
            width: this.host.clientWidth, height: this.host.clientHeight,
            antialias: true, backgroundAlpha: 0, resolution: Math.min(devicePixelRatio || 1, 2),
            autoDensity: true, preference: 'webgl', autoStart: false,
        });
        this.initialized = true;
        if (this.disposed) { this.app.destroy(true, {children: true}); return; }
        this.world.addChild(this.stage, this.motes, this.shadow, this.shield, this.actor, this.dust, this.shieldFront);
        this.app.stage.addChild(this.world);
        this.caveTexture = await Assets.load<Texture>({src: mossCaveImage, data: {resolution: 2}});
        if (this.disposed) return;
        this.stage.destroy({children: true});
        this.stage = createSlimeStage('cave', this.caveTexture);
        this.world.addChildAt(this.stage, 0);
        this.app.canvas.setAttribute('aria-label', '苔石兽动画预览，使用下方按钮切换动作');
        this.host.appendChild(this.app.canvas);
        this.observer.observe(this.host);
        this.resize();
        this.app.ticker.add(ticker => {
            const delta = Math.min(ticker.deltaMS / 1000, .05);
            this.time += delta; this.ambientTime += delta;
            if (this.action !== 'defeat' && this.time >= mossBeastDurations[this.action]) {
                this.action = 'idle'; this.time = 0; this.onComplete(this.action);
            }
            this.draw();
        });
        document.addEventListener('visibilitychange', this.syncPlayback);
        this.visibilityObserver.observe(this.host);
        this.reducedMotion.addEventListener('change', this.onMotionChange);
        this.syncPlayback();
    }

    get isPaused() { return this.paused; }
    play(action: MossBeastAction) { this.action = action; this.time = 0; this.draw(); this.app.render(); }
    setFacing(facing: MossBeastFacing) { this.facing = facing; this.draw(); this.app.render(); }
    setSmall(small: boolean) { this.actorScale = small ? .52 : 1.06; this.draw(); this.app.render(); }
    setBackdrop(backdrop: SlimeBackdrop) {
        this.stage.destroy({children: true});
        this.stage = createSlimeStage(backdrop, this.caveTexture);
        this.world.addChildAt(this.stage, 0); this.app.render();
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
        this.world.position.set(width / 2, height * .74);
        this.world.scale.set(Math.min(width / 640, height / 420));
        this.draw(); this.app.render();
    };

    private draw() {
        const pose = sampleMossBeastPose(this.action, this.time, this.facing);
        this.actor.position.set(pose.x * this.actorScale, 0);
        this.actor.scale.set(this.actorScale);
        this.actor.update(pose, this.time, this.facing);
        this.shadow.x = this.actor.x;
        this.shadow.scale.set(this.actorScale * (1 - Math.max(0, pose.lift) / 220), this.actorScale);
        this.shadow.alpha = 1 - Math.max(0, pose.lift) / 130;
        this.drawEffects(pose);
        this.motes.clear();
        for (let i = 0; i < 6; i++) {
            const t = this.ambientTime * .35 + i * 1.8;
            this.motes.circle(Math.sin(t) * 255, -120 - ((this.ambientTime * 13 + i * 47) % 205), 1.5 + i % 2)
                .fill({color: 0xffffff, alpha: .3 + Math.sin(t * 2) * .15});
        }
    }

    private drawEffects(pose: MossBeastPose) {
        const x = pose.x * this.actorScale, s = this.actorScale;
        this.dust.clear();
        drawMossBeastGuard(this.shield, this.shieldFront, pose.guard, this.time);
        for (const layer of [this.shield, this.shieldFront]) {
            layer.position.set(x, 0); layer.scale.set(s * (.72 + .28 * Math.min(1, this.time / .55)));
        }
        if (pose.impact > 0 && pose.impact < 1) this.dust.ellipse(110 * this.facing * s, 9, (135 + pose.impact * 60) * s, (16 + pose.impact * 11) * s)
            .stroke({color: 0x8d9f79, alpha: (1 - pose.impact) * .55, width: 3});
        if (pose.dust < .01) return;
        for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
            this.dust.ellipse(x + side * (118 + i * 19) * s, (4 - i * 7) * s, (9 + i * 3) * s, (5 + i * 2) * s)
                .fill({color: 0xb6bc97, alpha: pose.dust * (.33 - i * .07)});
        }
    }

    private onMotionChange = () => {
        if (this.reducedMotion.matches) this.paused = true;
        this.syncPlayback(); this.onComplete(this.action);
    };
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.observer.disconnect(); this.visibilityObserver.disconnect();
        this.reducedMotion.removeEventListener('change', this.onMotionChange);
        document.removeEventListener('visibilitychange', this.syncPlayback);
        if (this.initialized) this.app.destroy(true, {children: true});
        else {
            this.actor.destroy(); this.stage.destroy({children: true});
            this.shadow.destroy(); this.shield.destroy(); this.shieldFront.destroy();
            this.dust.destroy(); this.motes.destroy(); this.world.destroy();
        }
    }
}
