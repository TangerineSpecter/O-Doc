import {drawScene, type HitBox} from './drawScene';
import {WeatherOverlay} from './effects';
import {SCENE_H, SCENE_W, layoutFor, type SceneLayout} from './layout';
import {buildGround} from './ground';
import {FRAME_MS, drainTicks, nextDue, tickAlpha} from './pacing';
import {cx, type Canvas, type Ctx} from './pixel';
import {RainSheets} from './rainSheet';
import {SceneSimulation} from './simulation';
import type {SceneSelection, SceneState} from './types';

const FRAME_LEAD_MS = 6; // 定时器比目标时刻提前唤醒，再由 rAF 对齐到最近的屏幕刷新，避免错过一帧

/**
 * 像素农场画布控制器：持有 324×216 的逻辑画布，负责动画循环、整数倍缩放、鼠标点选与资源清理。
 * 只依赖 SceneState，不接触接口数据；调用方通过 setState 推送最新画面状态，用 dispose 释放全部监听。
 *
 * 动画按 tick（每秒 10 次）推进动物、居民等逻辑，画面以 FRAME_MS 为节拍出帧：tick 之间在上一位置与当前位置间插值，
 * 动物和居民走得更连贯；某一帧若没有任何对象移动过一个像素，就不重画。下雨时雨丝是两张预渲染的图案
 * （RainSheets），每帧只需两次 drawImage，没有逐滴的状态；雨天每帧都出图，所以出帧率直接决定 CPU 开销。
 * 循环由定时器驱动，只在到点时才用一次 rAF 对齐屏幕刷新。
 */
export class FarmSceneRenderer {
    private readonly g: Ctx;
    private readonly sim = new SceneSimulation();
    private readonly weather = new WeatherOverlay();
    private readonly rain = new RainSheets();
    private readonly resizeObserver: ResizeObserver;
    private readonly intersection: IntersectionObserver | null;
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    private ground: Canvas | null = null;
    private layout: SceneLayout = 'pond';
    private state: SceneState | null = null;
    private hits: HitBox[] = [];
    private hover: SceneSelection | null = null;
    private timerId = 0;
    private rafId = 0;
    private running = false;
    private onScreen = true;
    private acc = 0;
    private lastT = 0;
    private due = 0;
    private lastMotion = 0;
    private disposed = false;

    constructor(private readonly canvas: HTMLCanvasElement, private readonly box: HTMLElement, private readonly onSelect: (selection: SceneSelection) => void) {
        canvas.width = SCENE_W;
        canvas.height = SCENE_H;
        canvas.style.imageRendering = 'pixelated';
        canvas.style.display = 'block';
        this.g = cx(canvas, true);
        this.g.imageSmoothingEnabled = false;
        this.fit();
        this.resizeObserver = new ResizeObserver(this.fit);
        this.resizeObserver.observe(box);
        window.addEventListener('resize', this.fit);
        this.intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
            const last = entries[entries.length - 1];
            if (last && last.isIntersecting !== this.onScreen) { this.onScreen = last.isIntersecting; this.syncRunning(); }
        });
        this.intersection?.observe(canvas);
        document.addEventListener('visibilitychange', this.syncRunning);
        this.reducedMotion.addEventListener('change', this.syncRunning);
        canvas.addEventListener('pointermove', this.handleMove);
        canvas.addEventListener('pointerleave', this.clearHover);
        canvas.addEventListener('click', this.handleClick);
    }

    /** 推送最新状态并立即重绘；动物、居民等已有对象保持原位。 */
    setState(state: SceneState) {
        if (this.disposed) return;
        this.state = state;
        const layout = layoutFor(state.plots);
        if (!this.ground || layout !== this.layout) {
            this.layout = layout;
            this.ground = buildGround(layout);
        }
        this.weather.update(state, layout);
        this.sim.sync(state, layout);
        this.syncRunning();
        this.render();
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.stop();
        this.resizeObserver.disconnect();
        this.intersection?.disconnect();
        window.removeEventListener('resize', this.fit);
        document.removeEventListener('visibilitychange', this.syncRunning);
        this.reducedMotion.removeEventListener('change', this.syncRunning);
        this.canvas.removeEventListener('pointermove', this.handleMove);
        this.canvas.removeEventListener('pointerleave', this.clearHover);
        this.canvas.removeEventListener('click', this.handleClick);
    }

    /** 页面隐藏、画布滚出视口或系统要求减少动态效果时停止动画，只保留静态画面。 */
    private syncRunning = () => {
        const shouldRun = !this.disposed && !!this.state && this.onScreen && !document.hidden && !this.reducedMotion.matches;
        if (shouldRun && !this.running) {
            this.running = true;
            this.acc = 0;
            this.lastT = performance.now();
            this.due = this.lastT + FRAME_MS;
            this.schedule();
        } else if (!shouldRun) this.stop();
        if (this.state) this.render();
    };

    private stop() {
        this.running = false;
        clearTimeout(this.timerId);
        cancelAnimationFrame(this.rafId);
    }

    /** 到点前不做任何事：定时器提前一点唤醒，再请求一次 rAF 对齐屏幕刷新。 */
    private schedule() {
        const wait = Math.max(0, this.due - performance.now() - FRAME_LEAD_MS);
        this.timerId = window.setTimeout(() => { this.rafId = requestAnimationFrame(this.frame); }, wait);
    }

    private frame = () => {
        const state = this.state;
        if (!this.running || !state) return;
        const now = performance.now(), dt = now - this.lastT;
        this.lastT = now;
        const drained = drainTicks(this.acc, dt);
        this.acc = drained.acc;
        for (let i = 0; i < drained.ticks; i++) this.sim.tick(state);
        this.sim.alpha = tickAlpha(this.acc);
        const motion = this.sim.motionKey();
        if (drained.ticks || state.rain || motion !== this.lastMotion) this.render();
        this.due = nextDue(this.due, now, FRAME_MS);
        this.schedule();
    };

    /** 重画场景并记下本次画面里各对象的位置摘要。 */
    private render() {
        if (!this.state || !this.ground) return;
        this.hits = drawScene(this.g, {ground: this.ground, state: this.state, sim: this.sim, weather: this.weather, layout: this.layout, hover: this.hover});
        if (this.state.rain) this.rain.draw(this.g, performance.now());
        this.lastMotion = this.sim.motionKey();
    }

    /**
     * 缩放：优先取设备像素的整数倍，保证每个逻辑像素大小一致；
     * 整数倍会让画面比容器小 12% 以上时，改为填满容器（最近邻插值）。
     */
    private fit = () => {
        const width = this.box.clientWidth, dpr = window.devicePixelRatio || 1, avail = width * dpr, s = Math.floor(avail / SCENE_W);
        if (s < 1 || avail / (SCENE_W * s) > 1.12) {
            this.canvas.style.width = '100%';
            this.canvas.style.height = 'auto';
            return;
        }
        this.canvas.style.width = `${SCENE_W * s / dpr}px`;
        this.canvas.style.height = `${SCENE_H * s / dpr}px`;
    };

    private hitAt(e: MouseEvent): HitBox | undefined {
        const r = this.canvas.getBoundingClientRect();
        if (!r.width || !r.height) return undefined;
        const x = (e.clientX - r.left) / r.width * SCENE_W, y = (e.clientY - r.top) / r.height * SCENE_H;
        for (let i = this.hits.length - 1; i >= 0; i--) {
            const b = this.hits[i].box;
            if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return this.hits[i];
        }
        return undefined;
    }

    private setHover(selection: SceneSelection | null) {
        const same = this.hover === selection || (!!this.hover && !!selection && this.hover.kind === selection.kind && this.hover.id === selection.id);
        if (same) return;
        this.hover = selection;
        this.canvas.style.cursor = selection ? 'pointer' : 'default';
        this.render();
    }

    private handleMove = (e: PointerEvent) => this.setHover(e.pointerType === 'touch' ? null : this.hitAt(e)?.selection ?? null);
    private clearHover = () => this.setHover(null);
    private handleClick = (e: MouseEvent) => {
        const hit = this.hitAt(e);
        if (hit) this.onSelect(hit.selection);
    };
}
