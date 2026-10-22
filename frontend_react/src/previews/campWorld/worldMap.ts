import type {Point, Shape, WorldObject} from './types';

export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 400;
export const GROUND_Y = 334;
export const FOOT_RADIUS = 7;
export const RESIDENT_NAMES = {klee: '可莉', anya: '阿尼亚'} as const;
export const RESIDENT_COLORS = {klee: '#b85438', anya: '#976578'} as const;
const atGround = (x: number, facing: 1 | -1) => ({x, y: GROUND_Y, facing});

/** Orthographic side elevation. Buildings and rear scenery never become a walkable floor plane. */
export const worldObjects: WorldObject[] = [
    {id: 'cabin', name: '林间小屋', kind: '建筑 · 正立面', description: '门窗正对小路。以后的小屋也可以沿这条街向左右加建。', action: '去敲敲门', pose: 'wave',
        visual: {art: 'cabin', x: 135, width: 202, height: 213}, hit: {kind: 'rect', x: 135, y: 121, w: 202, h: 213},
        spots: [atGround(238, -1)], duration: 6, color: '#d5aa74'},
    {id: 'picnic', name: '花生点心桌', kind: '食物 · 2 人', description: '桌边有热茶，还有一小包阿尼亚守护的花生。', action: '去找点心吃', pose: 'inspect',
        visual: {art: 'picnic', x: 374, width: 87, height: 49}, hit: {kind: 'rect', x: 374, y: 285, w: 87, h: 49},
        spots: [atGround(363, 1), atGround(472, -1)], duration: 10, color: '#d7b56b'},
    {id: 'bench', name: '晚霞长椅', kind: '座位 · 2 人', description: '正对晚霞的长椅。坐一会儿，听听朋友的小声吐槽。', action: '坐下歇一会儿', pose: 'sit',
        visual: {art: 'bench', x: 526, width: 114, height: 55}, hit: {kind: 'rect', x: 526, y: 279, w: 114, h: 55},
        spots: [atGround(555, 1), atGround(609, -1)], duration: 12, color: '#c7985d'},
    {id: 'fire', name: '三叶篝火', kind: '营地设施 · 2 人', description: '石圈会挡住脚步。她们会轻轻跳过去，在两侧烤棉花糖。', action: '烤一颗棉花糖', pose: 'roast',
        visual: {art: 'fire', x: 729, width: 68, height: 30}, hit: {kind: 'rect', x: 722, y: 276, w: 81, h: 58},
        collision: {kind: 'rect', x: 738, y: 318, w: 50, h: 16}, spots: [atGround(703, 1), atGround(823, -1)], duration: 14, color: '#e49a54'},
    {id: 'rock', name: '苔藓小石头', kind: '障碍物 · 可以跳过', description: '挡在小路上的石头。左右走不穿过去，跳起后才能越过。', action: '过去看看苔藓', pose: 'inspect',
        visual: {art: 'rock', x: 990, width: 53, height: 28}, hit: {kind: 'rect', x: 990, y: 306, w: 53, h: 28},
        collision: {kind: 'rect', x: 997, y: 311, w: 40, h: 23}, spots: [atGround(974, 1), atGround(1062, -1)], duration: 6, color: '#96a565'},
    {id: 'tree', name: '老橡树', kind: '路旁树木', description: '树在小路后面。树洞里好像藏着一只打盹的松鼠。', action: '去看看树洞', pose: 'inspect',
        visual: {art: 'tree', x: 1110, width: 189, height: 218}, hit: {kind: 'rect', x: 1110, y: 116, w: 189, h: 218},
        spots: [atGround(1200, 1)], duration: 7, color: '#84a16c'},
    {id: 'pond', name: '落日溪桥', kind: '溪流 · 钓鱼点', description: '木桥与小路齐平，溪水在脚下。小鱼才不在乎你有多厉害。', action: '去桥上钓鱼', pose: 'fish',
        hit: {kind: 'rect', x: 1385, y: 317, w: 278, h: 83}, spots: [atGround(1458, 1), atGround(1568, -1)], duration: 16, color: '#6eaaaa'},
];

export const BRIDGE = {x: 1385, width: 278};
export const walkingBounds = {left: 46, right: WORLD_WIDTH - 46};
export const colliders: Shape[] = worldObjects.flatMap(object => object.collision ? [object.collision] : []);
export const findObject = (id: string | null) => worldObjects.find(object => object.id === id);
export const walkTargets: Point[] = [482, 668, 871, 1090, 1336, 1720].map(x => ({x, y: GROUND_Y}));
