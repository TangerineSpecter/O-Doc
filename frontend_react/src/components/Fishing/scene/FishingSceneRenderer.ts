import {cx, mk} from '../../Farm/scene/pixel';
import {drawFishArt} from '../fishArtDrawing';
import {getFishArtProfile} from '../fishVisuals';
import {buildFishingBackground, drawWater, SCENE_HEIGHT, SCENE_WIDTH} from './sceneArt';
import {CAST_SECONDS, drawFishingActor, RESULT_SECONDS} from './fishingAnimation';
import type {FishingSceneCue, FishingSceneState} from './sceneModel';

export class FishingSceneRenderer {
    private state: FishingSceneState = {spot: 'pond', mode: 'idle', actorId: ''};
    private background = buildFishingBackground('pond');
    private g: CanvasRenderingContext2D;
    private frame = 0;
    private clock = 0;
    private lastFrame = 0;
    private castStarted = 0;
    private cueStarted = 0;
    private queue: FishingSceneCue[] = [];
    private cue?: FishingSceneCue;
    private onDrained?: () => void;
    private fish?: HTMLCanvasElement;
    private preview = false;
    private previewCueSent = false;
    private media = window.matchMedia('(prefers-reduced-motion: reduce)');
    constructor(canvas: HTMLCanvasElement, private onCue: (cue: FishingSceneCue | null) => void, private onPreviewEnd: () => void) {
        canvas.width = SCENE_WIDTH; canvas.height = SCENE_HEIGHT;
        this.g = cx(canvas, true);
        this.g.imageSmoothingEnabled = false;
        document.addEventListener('visibilitychange', this.visibility);
        this.media.addEventListener('change', this.motionChanged);
        this.resume();
    }
    setState(state: FishingSceneState) {
        if (state.spot !== this.state.spot) this.background = buildFishingBackground(state.spot);
        if (state.actorId !== this.state.actorId || state.mode !== this.state.mode) this.castStarted = this.clock;
        this.state = state;
        this.draw();
    }
    enqueue(cues: FishingSceneCue[]) {
        this.queue.push(...cues);
        this.resume();
    }
    afterPlayback(callback: () => void) {
        this.onDrained = callback;
        this.notifyDrained();
    }
    private notifyDrained() {
        if (this.cue || this.queue.length || !this.onDrained) return;
        const callback = this.onDrained;
        this.onDrained = undefined;
        callback();
    }
    playPreview() {
        if (this.state.mode !== 'idle') return;
        this.preview = true; this.previewCueSent = false; this.castStarted = this.clock;
        this.cue = undefined; this.queue = []; this.onCue(null); this.resume();
    }
    private visibility = () => {
        if (document.hidden) {cancelAnimationFrame(this.frame); this.frame = 0;}
        else this.resume();
    };
    private motionChanged = () => {this.draw(); this.resume();};
    private resume() {
        if (document.hidden || this.frame) return;
        this.lastFrame = performance.now();
        this.frame = requestAnimationFrame(this.tick);
    }
    private tick = (now: number) => {
        this.frame = 0;
        // 限制后台恢复时的时间跳变；以 30 fps 绘制低分辨率像素场景。
        const delta = now - this.lastFrame;
        if (delta >= 32) {
            this.clock += Math.min(delta, 100) / 1000; this.lastFrame = now;
            if (this.preview && !this.previewCueSent && this.clock - this.castStarted > 4) {
                this.queue.push({id: 'preview', kind: 'catch', fishId: 'crucian', label: '动作演示 · 鲫鱼'}); this.previewCueSent = true;
            }
            if (this.cue && this.clock - this.cueStarted >= RESULT_SECONDS) {
                this.cue = undefined; this.onCue(null); this.castStarted = this.clock;
                if (this.preview) {this.preview = false; this.onPreviewEnd();}
            }
            if (!this.cue && this.queue.length) {
                this.cue = this.queue.shift()!; this.cueStarted = this.clock;
                this.fish = undefined;
                if (this.cue.fishId) {this.fish = mk(32, 32); drawFishArt(cx(this.fish), getFishArtProfile(this.cue.fishId));}
                this.onCue(this.cue);
            }
            this.draw();
            this.notifyDrained();
        }
        // 减弱动态时保留静态画面；事件及主动演示仍按时结束，不显示运动。
        if (!this.media.matches || this.cue || this.queue.length || this.preview) this.frame = requestAnimationFrame(this.tick);
    };
    private draw() {
        this.g.drawImage(this.background, 0, 0);
        drawWater(this.g, this.state.spot, this.media.matches ? 0 : this.clock);
        drawFishingActor(this.g, {mode: this.preview ? 'fishing' : this.state.mode,
            seconds: this.media.matches ? 0 : this.clock,
            castAge: this.media.matches ? CAST_SECONDS : this.clock - this.castStarted,
            cueAge: this.media.matches ? 3 : this.clock - this.cueStarted,
            cue: this.cue, fish: this.fish, actorId: this.state.actorId});
    }
    dispose() {
        cancelAnimationFrame(this.frame);
        document.removeEventListener('visibilitychange', this.visibility);
        this.media.removeEventListener('change', this.motionChanged);
        this.queue = [];
        this.onDrained = undefined;
    }
}
