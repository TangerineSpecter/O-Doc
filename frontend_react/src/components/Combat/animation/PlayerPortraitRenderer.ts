import {Application, Assets, Graphics} from 'pixi.js';
import type {Texture} from 'pixi.js';
import {PlayerRouteActor} from './PlayerRouteActor';
import {samplePlayerPose} from './playerRouteMotion';
import {playerSheetUrl} from '../art/playerVisuals';
import type {PlayerJob} from '../art/playerVisuals';

/** Atlas owns a single idle actor; appearance never implies an equipped weapon. */
export class PlayerPortraitRenderer {
    private readonly app = new Application();
    private actor?: PlayerRouteActor;
    private readonly shadow = new Graphics().ellipse(0, 4, 59, 9).fill({color: 0x356663, alpha: .13});
    private readonly resizeObserver = new ResizeObserver(() => this.resize());
    private readonly visibilityObserver = new IntersectionObserver(entries => {
        this.visible = entries.some(entry => entry.isIntersecting); this.syncPlayback();
    });
    private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    private visible = false;
    private initialized = false;
    private disposed = false;
    private time = 0;

    constructor(private readonly host: HTMLElement, private readonly job: PlayerJob) {}

    async init() {
        await this.app.init({width: Math.max(1, this.host.clientWidth), height: Math.max(1, this.host.clientHeight),
            backgroundAlpha: 0, antialias: false, autoDensity: true, autoStart: false,
            resolution: Math.min(devicePixelRatio || 1, 2), preference: 'webgl'});
        this.initialized = true;
        if (this.disposed) { this.app.destroy(true, {children: true}); return; }
        const sheet = await Assets.load<Texture>(playerSheetUrl);
        if (this.disposed) return;
        sheet.source.scaleMode = 'nearest';
        this.actor = new PlayerRouteActor(sheet, this.job);
        this.actor.setWeapon('none');
        this.app.stage.addChild(this.shadow, this.actor);
        this.app.canvas.setAttribute('aria-hidden', 'true');
        this.app.canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
        this.host.appendChild(this.app.canvas);
        this.app.ticker.add(ticker => {
            this.time += Math.min(ticker.deltaMS / 1000, .05);
            this.actor?.update(samplePlayerPose('idle', this.time), 1);
        });
        this.resizeObserver.observe(this.host); this.visibilityObserver.observe(this.host);
        document.addEventListener('visibilitychange', this.syncPlayback);
        this.reducedMotion.addEventListener('change', this.onMotionChange);
        this.resize();
    }

    private resize() {
        if (!this.actor || this.disposed) return;
        const width = this.host.clientWidth, height = this.host.clientHeight;
        if (!width || !height) return;
        const scale = Math.min(width / 200, height / 224);
        this.app.renderer.resize(width, height);
        this.actor.position.set(width / 2, height / 2 + 96.32 * scale);
        this.actor.scale.set(scale);
        this.shadow.position.copyFrom(this.actor.position); this.shadow.scale.copyFrom(this.actor.scale);
        this.actor.update(samplePlayerPose('idle', this.time), 1); this.app.render();
    }

    private syncPlayback = () => {
        if (!this.initialized || this.disposed) return;
        if (document.hidden || !this.visible || this.reducedMotion.matches) this.app.stop();
        else this.app.start();
    };
    private onMotionChange = () => {
        if (this.reducedMotion.matches) { this.time = 0; this.resize(); }
        this.syncPlayback();
    };

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.resizeObserver.disconnect(); this.visibilityObserver.disconnect();
        document.removeEventListener('visibilitychange', this.syncPlayback);
        this.reducedMotion.removeEventListener('change', this.onMotionChange);
        if (this.initialized) this.app.destroy(true, {children: true});
        if (!this.shadow.destroyed) this.shadow.destroy();
    }
}
