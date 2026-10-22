import {activityLine, greetings} from './dialogue';
import {distance, findPath, isWalkable, nearbyWalkable, segmentClear} from './navigation';
import {findObject, GROUND_Y, RESIDENT_NAMES, WORLD_WIDTH, walkTargets, worldObjects} from './worldMap';
import type {JournalEntry, Point, Resident, ResidentId, WorldCommand, WorldObject, WorldSnapshot} from './types';

const timeLabel = (seconds: number) => {
    const minutes = 17 * 60 + 42 + Math.floor(seconds / 8);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};
export {timeLabel};

function makeResident(id: ResidentId, x: number, y: number): Resident {
    return {id, x, y, facing: id === 'klee' ? 1 : -1, pose: 'wave', path: [], targetId: null, spotIndex: 0,
        until: id === 'klee' ? 3 : 4.4, nextTalk: 0, speech: null, actionSince: 0, status: '刚刚抵达营地',
        lastObject: null, travel: 0, blockedFor: 0, arrivalFacing: 1, manual: false};
}

/** A local demo only. Intent, reservations and movement are independent of rendering and never write Agent data. */
export class CampSimulation {
    time = 0;
    paused = false;
    automatic = true;
    debug = false;
    speed = 1;
    selected: ResidentId = 'klee';
    inspected: string | null = null;
    notice = '';
    cameraX = 0;
    viewWidth = 1280;
    following = true;
    residents: Resident[] = [makeResident('klee', 667, GROUND_Y), makeResident('anya', 864, GROUND_Y)];
    journal: JournalEntry[] = [];
    private sequence = 0;
    private seed = 193;
    private talkCount: Record<ResidentId, number> = {klee: 0, anya: 0};
    private replyAt = Infinity;
    private fishEvents = new Set<ResidentId>();

    constructor() {
        this.log('可莉和阿尼亚发现了这片林间营地。');
        this.say(this.residents[0], '可莉发现了一个超棒的营地！', 5.5);
        this.say(this.residents[1], '有花生吗？阿尼亚先问这个。', 6.5);
    }

    private random(): number {
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        return this.seed / 4294967296;
    }

    private log(text: string, resident?: ResidentId) {
        this.journal.unshift({id: ++this.sequence, time: timeLabel(this.time), text, resident});
        this.journal = this.journal.slice(0, 24);
    }

    say(resident: Resident, text: string, duration = 5.6) {
        resident.speech = {text, since: this.time, until: this.time + duration};
        this.log(`${RESIDENT_NAMES[resident.id]}：${text}`, resident.id);
    }

    command(command: WorldCommand) {
        this.notice = '';
        const resident = this.residents.find(item => item.id === this.selected)!;
        switch (command.type) {
            case 'select': {
                this.selected = command.id; this.inspected = null; this.following = true;
                const selected = this.residents.find(item => item.id === command.id)!;
                if (selected.x < this.cameraX + 60 || selected.x > this.cameraX + this.viewWidth - 60)
                    this.cameraX = Math.max(0, Math.min(WORLD_WIDTH - this.viewWidth, selected.x - this.viewWidth / 2));
                break;
            }
            case 'pan': this.following = false; this.cameraX = Math.max(0, Math.min(WORLD_WIDTH - this.viewWidth, this.cameraX + command.direction * this.viewWidth * .55)); break;
            case 'follow': this.following = !this.following; break;
            case 'interact': {
                const object = findObject(command.objectId);
                if (object) {this.inspected = object.id; this.assign(resident, object, true);}
                break;
            }
            case 'move': {
                this.inspected = null;
                const destination = nearbyWalkable(command.point, 20);
                if (!destination || !this.walk(resident, destination)) this.notice = '那里走不过去，试试草地或小路吧。';
                else {resident.manual = true; resident.targetId = null; resident.status = '去你指的地方看看';}
                break;
            }
            case 'pause': this.paused = !this.paused; break;
            case 'automatic': this.automatic = !this.automatic; break;
            case 'debug': this.debug = !this.debug; break;
            case 'speed': this.speed = this.speed === 1 ? 2 : 1; break;
            case 'gather':
                this.assign(this.residents[0], findObject('fire')!, true);
                this.assign(this.residents[1], findObject('fire')!, true);
                this.inspected = 'fire';
                break;
            case 'greet':
                if (resident.y < GROUND_Y - 1) {this.say(resident, '等可莉落地！'.replace('可莉', RESIDENT_NAMES[resident.id])); break;}
                resident.pose = 'wave'; resident.path = []; resident.targetId = null; resident.actionSince = this.time;
                resident.until = this.time + 3; resident.status = '向你打招呼';
                this.say(resident, greetings[resident.id][this.talkCount[resident.id]++ % 2]);
                break;
            case 'closeInspector': this.inspected = null; break;
            case 'reset': break; // The scene replaces this simulation, preserving its pause preference.
        }
    }

    private walk(resident: Resident, destination: Point): boolean {
        if (resident.y < GROUND_Y - 1) return false;
        const path = findPath(resident, destination);
        if (!path) return false;
        resident.path = path; resident.pose = 'walk'; resident.actionSince = this.time; resident.blockedFor = 0;
        return true;
    }

    assign(resident: Resident, object: WorldObject, manual = false): boolean {
        const occupied = new Set(this.residents.filter(other => other !== resident && other.targetId === object.id).map(other => other.spotIndex));
        const options = object.spots.map((spot, index) => ({spot, index})).filter(({index}) => !occupied.has(index))
            .sort((a, b) => distance(resident, a.spot) - distance(resident, b.spot));
        for (const {spot, index} of options) {
            if (!this.walk(resident, spot)) continue;
            resident.targetId = object.id; resident.spotIndex = index; resident.arrivalFacing = spot.facing;
            resident.status = `正走向${object.name}`; resident.manual = manual; this.fishEvents.delete(resident.id);
            return true;
        }
        if (manual) this.notice = resident.y < GROUND_Y - 1 ? '她正在跳跃，落地后再安排吧。' : options.length ? '暂时走不过去，换个方向试试。' : '这里已经有人啦，等她玩一会儿。';
        return false;
    }

    private choose(resident: Resident) {
        if (!resident.lastObject && this.assign(resident, findObject('fire')!)) return;
        const preferences = resident.id === 'anya' ? ['picnic', 'bench', 'pond', 'fire', 'tree', 'rock', 'cabin']
            : ['pond', 'fire', 'tree', 'bench', 'rock', 'picnic', 'cabin'];
        const first = Math.floor(this.random() * preferences.length);
        for (let i = 0; i < preferences.length; i++) {
            const object = findObject(preferences[(first + i) % preferences.length])!;
            if (object.id !== resident.lastObject && this.assign(resident, object)) return;
        }
        const target = walkTargets[Math.floor(this.random() * walkTargets.length)];
        if (this.walk(resident, target)) {resident.targetId = null; resident.status = '在营地里散步';}
        else resident.until = this.time + 2;
    }

    private arrive(resident: Resident) {
        const object = findObject(resident.targetId);
        resident.actionSince = this.time; resident.blockedFor = 0;
        if (!object) {resident.pose = 'idle'; resident.status = '看看风景'; resident.until = this.time + 3; return;}
        resident.pose = object.pose; resident.facing = resident.arrivalFacing;
        resident.until = this.time + object.duration + this.random() * 3;
        resident.nextTalk = this.time + 6; resident.lastObject = object.id;
        resident.status = {roast: '认真烤棉花糖', sit: '坐着看晚霞', fish: '安静等小鱼上钩', inspect: object.id === 'picnic' ? '研究点心篮子' : '发现一点小秘密', wave: '敲门借两个杯子'}[object.pose as 'roast' | 'sit' | 'fish' | 'inspect' | 'wave'] ?? '享受营地时光';
        this.say(resident, activityLine(object.id, resident.id, this.talkCount[resident.id]++));
        if (object.id === 'fire') this.replyAt = this.time + 7;
    }

    private move(resident: Resident, dt: number) {
        const other = this.residents.find(item => item !== resident)!;
        const goal = resident.path[resident.path.length - 1];
        const grounded = Math.abs(resident.y - GROUND_Y) < .5;
        const toward = Math.sign(goal.x - resident.x);
        if (grounded && Math.abs(other.y - GROUND_Y) < .5 && Math.abs(other.x - resident.x) < 68
            && toward === Math.sign(other.x - resident.x) && this.time > resident.blockedFor) {
            const detour = findPath(resident, goal, [{kind: 'rect', x: other.x - 12, y: GROUND_Y - 48, w: 24, h: 48}]);
            if (detour) {resident.path = detour; resident.blockedFor = this.time + 3;}
        }
        let budget = dt * (resident.path[0].y < GROUND_Y - .1 || !grounded ? 180 : resident.id === 'klee' ? 49 : 44);
        let steps = 0;
        while (budget > .001 && resident.path.length && steps++ < 50) {
            const target = resident.path[0], d = distance(resident, target), step = Math.min(d, budget);
            const next = d < .001 ? target : {x: resident.x + (target.x - resident.x) / d * step, y: resident.y + (target.y - resident.y) / d * step};
            if (!segmentClear(resident, next)) {
                resident.status = '前面有障碍，停下看看'; resident.path = []; resident.pose = 'idle'; resident.until = this.time + 1; return;
            }
            if (Math.abs(next.x - resident.x) > .01) resident.facing = next.x > resident.x ? 1 : -1;
            resident.travel += step; resident.x = next.x; resident.y = next.y; budget -= step;
            if (d <= step + .001) resident.path.shift(); else break;
        }
        if (!resident.path.length) this.arrive(resident);
    }

    tick(elapsed: number) {
        if (this.paused) return;
        const dt = Math.min(elapsed, .05) * this.speed;
        this.time += dt;
        for (const resident of this.residents) {
            if (resident.speech && resident.speech.until <= this.time) resident.speech = null;
            if (resident.path.length) this.move(resident, dt);
            else if (this.time > resident.until) {
                resident.manual = false;
                if (this.automatic) this.choose(resident);
                else {resident.pose = 'idle'; resident.status = '等你安排下一次冒险'; resident.targetId = null; resident.until = this.time + 1;}
            } else if (resident.targetId === 'pond' && resident.pose === 'fish' && this.time - resident.actionSince > 8 && !this.fishEvents.has(resident.id)) {
                this.fishEvents.add(resident.id);
                this.say(resident, resident.id === 'klee' ? '上钩啦！这次真的是用鱼竿哦！' : '钓到啦！小鱼说它只是路过。');
            } else if (resident.targetId && this.time > resident.nextTalk && !resident.speech) {
                resident.nextTalk = this.time + 10;
                this.say(resident, activityLine(resident.targetId, resident.id, this.talkCount[resident.id]++));
            }
        }
        if (this.following) {
            const selected = this.residents.find(item => item.id === this.selected)!;
            const margin = this.viewWidth * .3;
            let desired = this.cameraX;
            if (selected.x < this.cameraX + margin) desired = selected.x - margin;
            if (selected.x > this.cameraX + this.viewWidth - margin) desired = selected.x - this.viewWidth + margin;
            desired = Math.max(0, Math.min(WORLD_WIDTH - this.viewWidth, desired));
            this.cameraX += (desired - this.cameraX) * Math.min(1, dt * 4);
        }
        if (this.time >= this.replyAt) {
            this.replyAt = Infinity;
            const a = this.residents[0], b = this.residents[1];
            if (a.pose === 'roast' && b.pose === 'roast') this.say(b, '她说只是烤棉花糖。阿尼亚相信……一点点。');
        }
    }

    snapshot(): WorldSnapshot {
        return {time: this.time, paused: this.paused, automatic: this.automatic, selected: this.selected, speed: this.speed,
            debug: this.debug, inspected: this.inspected, notice: this.notice, journal: this.journal, cameraX: this.cameraX, viewWidth: this.viewWidth, following: this.following,
            residents: this.residents.map(resident => ({id: resident.id, name: RESIDENT_NAMES[resident.id], status: resident.status, pose: resident.pose, x: resident.x, y: resident.y, speech: resident.speech}))};
    }

    /** Shared with browser verification; diagnostics are read-only and never advance simulation state. */
    diagnostics() {
        return {time: this.time, groundY: GROUND_Y, cameraX: this.cameraX, viewWidth: this.viewWidth, actors: this.residents.map(({id, x, y, pose, targetId, path}) => ({id, x, y, pose, targetId, route: path, walkable: isWalkable({x, y})})),
            objects: worldObjects.map(({id, name, collision}) => ({id, name, blocks: !!collision}))};
    }
}
