import type {ObjectArt, ResidentId} from '../campWorld/types';
import type {FrameName} from '../campWorld/art';

export type TemplateId = ObjectArt | 'lamp';
export type RoomId = 'camp' | 'room';
export interface FurnitureTemplate {
    id: TemplateId;
    name: string;
    category: string;
    width: number;
    height: number;
    solid: boolean;
    foot: {x: number; width: number; height: number};
    action: string;
    pose: FrameName;
    description: string;
}
export interface Placement {
    id: string;
    templateId: TemplateId;
    col: number;
    name: string;
    solid: boolean;
    flipped: boolean;
    lit: boolean;
}
export interface StudioDocument {version: 1; scenes: Record<RoomId, Placement[]>}
export interface StudioArt {
    background: HTMLImageElement;
    objects: Record<TemplateId, HTMLCanvasElement>;
    characters: Record<ResidentId, Record<FrameName, HTMLCanvasElement>>;
}
export interface ActorView {id: ResidentId; x: number; pose: FrameName; facing: 1 | -1; text: string; target: string | null}
export interface StageOptions {
    room: RoomId;
    placements: Placement[];
    selected: string | null;
    brush: TemplateId | null;
    grid: boolean;
    collisions: boolean;
    running: boolean;
}
