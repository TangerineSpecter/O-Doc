import {Application, Assets, Container, Graphics} from 'pixi.js';
import type {Texture} from 'pixi.js';
import mossCaveImage from '../../../assets/combat/moss-cave.svg';
import {CaveBatActor} from './CaveBatActor';
import {sampleCaveBatPose, caveBatDurations} from './caveBatMotion';
import type {CaveBatAction, CaveBatFacing, CaveBatPose} from './caveBatMotion';
import {createSlimeStage} from './slimeStage';
import type {SlimeBackdrop} from './slimeStage';

export class CaveBatPreviewScene {
    private readonly app = new Application();
    private readonly world = new Container();
    private readonly actor = new CaveBatActor();
    private readonly shadow = new Graphics().ellipse(0, 0, 88, 12).fill({color: 0x356663, alpha: .16});
    private readonly effect = new Graphics();
    private readonly motes = new Graphics();
    private readonly ghosts = [new CaveBatActor(), new CaveBatActor()];
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
    private action: CaveBatAction = 'idle';
    private facing: CaveBatFacing = 1;
    private time = 0;
    private ambientTime = 0;
    private actorScale = 1.05;
    private paused = this.reducedMotion.matches;

    constructor(private readonly host: HTMLElement, private readonly onComplete: (action: CaveBatAction) => void) {
        this.observer = new ResizeObserver(this.resize);
    }

    async init() {
        await this.app.init({
            width: this.host.clientWidth, height: this.host.clientHeight,
            antialias: true, backgroundAlpha: 0, resolution: Math.min(devicePixelRatio || 1, 2),
            autoDensity: true, preference: 'webgl',
        });
        this.initialized = true;
        if (this.disposed) { this.app.destroy(true, {children: true}); return; }
        this.world.addChild(this.stage, this.motes, this.shadow, this.effect, ...this.ghosts, this.actor);
        this.app.stage.addChild(this.world);
        this.caveTexture = await Assets.load<Texture>({src: mossCaveImage, data: {resolution: 2}});
        if (this.disposed) return;
        this.stage.destroy({children: true});
        this.stage = createSlimeStage('cave', this.caveTexture);
        this.world.addChildAt(this.stage, 0);
        this.app.canvas.setAttribute('aria-label', '洞穴蝙蝠动画预览，使用下方按钮切换动作');
        this.host.appendChild(this.app.canvas);
        this.observer.observe(this.host);
        this.resize();
        this.app.ticker.add(ticker => {
            const delta = Math.min(ticker.deltaMS / 1000, .05);
            this.time += delta;
            this.ambientTime += delta;
            if (this.action !== 'defeat' && this.time >= caveBatDurations[this.action]) {
                this.action = 'idle';
                this.time = 0;
                this.onComplete(this.action);
            }
            this.draw();
        });
        document.addEventListener('visibilitychange', this.syncPlayback);
        this.visibilityObserver.observe(this.host);
        this.reducedMotion.addEventListener('change', this.onMotionChange);
        this.syncPlayback();
    }

    get isPaused() { return this.paused; }

    play(action: CaveBatAction) {
        this.action = action;
        this.time = 0;
        this.draw();
        this.app.render();
    }

    setFacing(facing: CaveBatFacing) { this.facing = facing; this.draw(); this.app.render(); }

    setSmall(small: boolean) {
        this.actorScale = small ? .56 : 1.05;
        this.draw();
        this.app.render();
    }

    setBackdrop(backdrop: SlimeBackdrop) {
        this.stage.destroy({children: true});
        this.stage = createSlimeStage(backdrop, this.caveTexture);
        this.world.addChildAt(this.stage, 0);
        this.app.render();
    }

    togglePaused() {
        this.paused = !this.paused;
        this.syncPlayback();
        return this.paused;
    }

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
        this.draw();
        this.app.render();
    };

    private draw() {
        const pose = sampleCaveBatPose(this.action, this.time, this.facing);
        this.actor.position.set(pose.x * this.actorScale, 0);
        this.actor.scale.set(this.actorScale);
        this.actor.update(pose, this.time, this.facing);
        this.shadow.x = this.actor.x;
        this.shadow.y = 8;
        this.shadow.scale.set(this.actorScale * pose.scaleX * (1 - Math.max(0, pose.lift) / 260), this.actorScale);
        this.shadow.alpha = 1 - Math.max(0, pose.lift) / 180;
        this.drawEffects(pose);
        this.motes.clear();
        for (let i = 0; i < 7; i++) {
            const t = this.ambientTime * .35 + i * 1.8;
            this.motes.circle(Math.sin(t) * 255, -120 - ((this.ambientTime * 13 + i * 47) % 205), 1.5 + i % 2)
                .fill({color: 0xffffff, alpha: .35 + Math.sin(t * 2) * .2});
        }
    }

    private drawEffects(pose: CaveBatPose) {
        this.effect.clear();
        this.ghosts.forEach((ghost, i) => {
            ghost.visible = pose.trail > .05;
            if (!ghost.visible) return;
            const previousTime = Math.max(0, this.time - (i + 1) * .065);
            const previous = sampleCaveBatPose(this.action, previousTime, this.facing);
            ghost.position.set(previous.x * this.actorScale, 0);
            ghost.scale.set(this.actorScale);
            ghost.alpha = pose.trail * (.15 - i * .05);
            ghost.update(previous, previousTime, this.facing);
        });
        if (pose.trail < .05) return;
        const x = pose.x * this.actorScale, y = (-115 - pose.lift) * this.actorScale;
        const direction = this.action === 'dodge' ? -this.facing : this.facing;
        for (let i = 0; i < 3; i++) {
            this.effect.moveTo(x - direction * (50 + i * 8), y + i * 12)
                .quadraticCurveTo(x - direction * 85, y + i * 12 - 6, x - direction * (105 + i * 12), y + i * 12)
                .stroke({color: 0xa7a0c5, width: 2, alpha: pose.trail * .35, cap: 'round'});
        }
        if (this.action === 'dodge') this.effect.ellipse(x, 10, 75 * this.actorScale, 11 * this.actorScale)
            .stroke({color: 0xb3aacd, width: 2, alpha: pose.trail * .4});
    }

    private onMotionChange = () => {
        if (this.reducedMotion.matches) this.paused = true;
        this.syncPlayback();
        this.onComplete(this.action);
    };

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.observer.disconnect();
        this.visibilityObserver.disconnect();
        this.reducedMotion.removeEventListener('change', this.onMotionChange);
        document.removeEventListener('visibilitychange', this.syncPlayback);
        if (this.initialized) {
            this.app.destroy(true, {children: true});
        }
        else {
            // init may still be awaiting the renderer; its completion releases app.
            this.actor.destroy();
            this.ghosts.forEach(ghost => ghost.destroy());
            this.stage.destroy({children: true});
            this.shadow.destroy();
            this.effect.destroy();
            this.motes.destroy();
            this.world.destroy();
        }
    }
}
