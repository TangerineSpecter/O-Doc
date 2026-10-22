export interface Point { x: number; y: number }
export type ResidentId = 'klee' | 'anya';
export type Pose = 'idle' | 'walk' | 'wave' | 'sit' | 'roast' | 'happy' | 'fish' | 'inspect';
export type Shape = { kind: 'rect'; x: number; y: number; w: number; h: number }
    | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number }
    | { kind: 'polygon'; points: Point[] };
export interface InteractionSpot extends Point { facing: 1 | -1 }
export type ObjectArt = 'cabin' | 'tree' | 'bench' | 'picnic' | 'fire' | 'rock';
export interface WorldObject {
    id: string;
    name: string;
    kind: string;
    description: string;
    action: string;
    pose: Pose;
    hit: Shape;
    collision?: Shape;
    spots: InteractionSpot[];
    duration: number;
    color: string;
    visual?: {art: ObjectArt; x: number; width: number; height: number};
}
export interface Speech { text: string; until: number; since: number }
export interface Resident extends Point {
    id: ResidentId;
    facing: 1 | -1;
    pose: Pose;
    path: Point[];
    targetId: string | null;
    spotIndex: number;
    until: number;
    nextTalk: number;
    speech: Speech | null;
    actionSince: number;
    status: string;
    lastObject: string | null;
    travel: number;
    blockedFor: number;
    arrivalFacing: 1 | -1;
    manual: boolean;
}
export interface JournalEntry { id: number; time: string; text: string; resident?: ResidentId }
export interface ResidentView { id: ResidentId; name: string; status: string; pose: Pose; x: number; y: number; speech: Speech | null }
export interface WorldSnapshot {
    time: number;
    paused: boolean;
    automatic: boolean;
    selected: ResidentId;
    speed: number;
    debug: boolean;
    residents: ResidentView[];
    journal: JournalEntry[];
    inspected: string | null;
    notice: string;
    cameraX: number;
    viewWidth: number;
    following: boolean;
}
export type WorldCommand = { type: 'select'; id: ResidentId }
    | {type: 'pan'; direction: -1 | 1}
    | { type: 'interact'; objectId: string }
    | { type: 'move'; point: Point }
    | { type: 'pause' | 'automatic' | 'debug' | 'speed' | 'reset' | 'gather' | 'greet' | 'closeInspector' | 'follow' };
